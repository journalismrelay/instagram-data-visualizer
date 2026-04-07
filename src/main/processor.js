const fs = require('fs');
const path = require('path');

function readJSONSingle(baseDir, relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(baseDir, relPath), 'utf8'));
  } catch (e) {
    return null;
  }
}

// ===================================
// HTML Export Parser
// Falls back to HTML when JSON is not available
// ===================================

function parseHTMLDate(dateStr) {
  // "Apr 06, 2026 5:04 pm" or "Apr 06, 2026"
  if (!dateStr) return 0;
  try {
    return Math.floor(new Date(dateStr).getTime() / 1000) || 0;
  } catch { return 0; }
}

function extractHTMLText(html) {
  // Strip tags and decode entities
  return html.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/&#064;/g, '@').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

/**
 * Parse Instagram HTML export files into the same structure as JSON.
 * Each HTML file type has a specific pattern we extract.
 */
function readHTMLSingle(baseDir, relPath) {
  // Map JSON paths to their HTML equivalents
  const htmlPath = relPath.replace(/\.json$/, '.html');
  const fullPath = path.join(baseDir, htmlPath);

  try {
    fs.accessSync(fullPath);
  } catch { return null; }

  const html = fs.readFileSync(fullPath, 'utf8');

  // --- Followers / Following / Blocked / Unfollowed / Close Friends ---
  // Pattern: <h2>username</h2>...<a href="https://instagram.com/...">...</a>...<div>Date</div>
  // Or: <a href="https://instagram.com/username">username</a><div>Date</div>
  if (relPath.includes('followers_and_following/')) {
    const items = [];
    // Pattern 1: following.html style - <h2>username</h2> with link and date
    const h2Pattern = /<h2[^>]*>([^<]+)<\/h2><div class="_a6-p"><div><div><a[^>]*href="([^"]*)"[^>]*>[^<]*<\/a><\/div><div>([^<]*)<\/div>/g;
    let m;
    while ((m = h2Pattern.exec(html)) !== null) {
      items.push({ ts: parseHTMLDate(m[3]), username: m[1].trim(), url: m[2] });
    }
    // Pattern 2: followers.html style - <a href="url">username</a><div>date</div>
    if (items.length === 0) {
      const aPattern = /<a[^>]*href="(https:\/\/www\.instagram\.com\/[^"]+)"[^>]*>([^<]+)<\/a><\/div><div>([^<]+)<\/div>/g;
      while ((m = aPattern.exec(html)) !== null) {
        items.push({ ts: parseHTMLDate(m[3]), username: m[2].trim(), url: m[1] });
      }
    }

    // Determine the wrapper key from filename
    if (relPath.includes('following.json')) return { relationships_following: items.map(i => ({ title: i.username, string_list_data: [{ href: i.url, timestamp: i.ts }] })) };
    if (relPath.includes('blocked_profiles.json')) return { relationships_blocked_users: items.map(i => ({ title: i.username, string_list_data: [{ href: i.url, timestamp: i.ts }] })) };
    if (relPath.includes('recently_unfollowed')) return { relationships_unfollowed_users: items.map(i => ({ title: '', string_list_data: [{ href: i.url, value: i.username, timestamp: i.ts }] })) };
    if (relPath.includes('close_friends')) return { relationships_close_friends: items.map(i => ({ title: '', string_list_data: [{ href: i.url, value: i.username, timestamp: i.ts }] })) };
    // followers
    return items.map(i => ({ title: '', string_list_data: [{ href: i.url, value: i.username, timestamp: i.ts }] }));
  }

  // --- Liked Posts ---
  if (relPath.includes('likes/liked_posts')) {
    const items = [];
    // Each liked post block has: URL link, Owner with Username/Name, and a date
    const blockRegex = /href="(https:\/\/www\.instagram\.com\/[^"]+)"[^>]*>[^<]*<\/a><\/div><\/td>/g;
    const dates = html.match(/\w{3} \d{1,2}, \d{4},? \d{1,2}:\d{2}(:\d{2})? [ap]m/gi) || [];
    const urls = [];
    let m;
    while ((m = blockRegex.exec(html)) !== null) urls.push(m[1]);

    // Extract owner usernames - they appear in nested tables after Owner heading
    const ownerBlocks = html.split(/Owner<\/h2>/i);
    for (let i = 0; i < urls.length; i++) {
      // Try to find username near each URL
      const usernameMatch = ownerBlocks[i + 1]?.match(/Username<\/td><td[^>]*>([^<]+)/);
      items.push({
        timestamp: parseHTMLDate(dates[i] || ''),
        label_values: [
          { label: 'URL', href: urls[i], value: urls[i] },
          ...(usernameMatch ? [{ title: 'Owner', dict: [{ dict: [{ label: 'Username', value: usernameMatch[1].trim() }] }] }] : []),
        ],
      });
    }
    return items;
  }

  // --- Liked Comments ---
  if (relPath.includes('likes/liked_comments')) {
    const items = [];
    const pattern = /<a[^>]*href="(https:\/\/www\.instagram\.com\/[^"]+)"[^>]*>[^<]*<\/a>/g;
    const dates = html.match(/\w{3} \d{1,2}, \d{4},? \d{1,2}:\d{2}(:\d{2})? [ap]m/gi) || [];
    let m, idx = 0;
    while ((m = pattern.exec(html)) !== null) {
      items.push({ title: '', string_list_data: [{ href: m[1], timestamp: parseHTMLDate(dates[idx] || ''), value: '' }] });
      idx++;
    }
    return { likes_comment_likes: items };
  }

  // --- Comments ---
  if (relPath.includes('comments/post_comments') || relPath.includes('comments/reels_comments')) {
    const items = [];
    const commentPattern = /Comment<div><div>([^<]*(?:<[^>]+>[^<]*)*)<\/div><\/div><\/td><\/tr><tr><td[^>]*>Media Owner<div><div>([^<]+)<\/div><\/div><\/td><\/tr><tr><td[^>]*>Time<\/td><td[^>]*>([^<]+)<\/td>/g;
    let m;
    while ((m = commentPattern.exec(html)) !== null) {
      items.push({
        string_map_data: {
          Comment: { value: extractHTMLText(m[1]) },
          'Media Owner': { value: m[2].trim() },
          Time: { timestamp: parseHTMLDate(m[3]) },
        },
      });
    }
    if (relPath.includes('reels_comments')) return { comments_reels_comments: items };
    return items;
  }

  // --- Personal Information ---
  if (relPath.includes('personal_information/personal_information.json')) {
    const fields = {};
    const fieldPattern = /class="_2pin _a6_q">(\w[\w\s]*?)<div><div>([^<]*)<\/div>/g;
    const tdPattern = /class="_2pin _a6_q">([\w\s]+)<\/td><td[^>]*>([^<]+)/g;
    let m;
    while ((m = fieldPattern.exec(html)) !== null) {
      fields[m[1].trim()] = { value: m[2].trim(), href: '', timestamp: 0 };
    }
    while ((m = tdPattern.exec(html)) !== null) {
      if (!fields[m[1].trim()]) fields[m[1].trim()] = { value: m[2].trim(), href: '', timestamp: 0 };
    }
    // Extract profile photo from <img> tag near "Profile Photo"
    const photoMatch = html.match(/Profile Photo.*?<img[^>]*src="([^"]+)"/s);
    const mediaMap = photoMatch
      ? { 'Profile Photo': { uri: photoMatch[1], creation_timestamp: 0 } }
      : {};
    return { profile_user: [{ string_map_data: fields, media_map_data: mediaMap }] };
  }

  // --- Saved Posts ---
  if (relPath.includes('saved/saved_posts')) {
    const items = [];
    const pattern = /<h2[^>]*>([^<]+)<\/h2>.*?href="(https:\/\/www\.instagram\.com\/[^"]*)".*?(\w{3} \d{1,2}, \d{4}[^<]*)/gs;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      items.push({ title: m[1].trim(), string_map_data: { 'Saved on': { href: m[2], timestamp: parseHTMLDate(m[3]) } } });
    }
    return { saved_saved_media: items };
  }

  // --- Story Likes (array format) ---
  if (relPath.includes('story_interactions/story_likes')) {
    const items = [];
    const pattern = /href="(https:\/\/www\.instagram\.com\/stories\/[^"]+)"[^>]*>[^<]*<\/a>.*?Username<\/td><td[^>]*>([^<]+)/gs;
    let m;
    while ((m = pattern.exec(html)) !== null) {
      items.push({
        timestamp: 0,
        label_values: [
          { label: 'URL', href: m[1], value: m[1] },
          { title: 'Owner', dict: [{ dict: [{ label: 'Username', value: m[2].trim() }] }] },
        ],
      });
    }
    return items;
  }

  // --- Story Interactions (emoji, polls, quizzes, questions) ---
  if (relPath.includes('story_interactions/emoji_sliders')) {
    return { story_activities_emoji_sliders: parseStoryInteractionHTML(html) };
  }
  if (relPath.includes('story_interactions/polls')) {
    return { story_activities_polls: parseStoryInteractionHTML(html) };
  }
  if (relPath.includes('story_interactions/quizzes')) {
    return { story_activities_quizzes: parseStoryInteractionHTML(html) };
  }
  if (relPath.includes('story_interactions/questions')) {
    return { story_activities_questions: parseStoryInteractionHTML(html) };
  }

  // --- Posts / Archived Posts / Stories / Reposts / Profile Photos ---
  // These are media-based and may not have useful data in HTML beyond what's in the folder
  // Return empty to let the processor handle gracefully
  return null;
}

function parseStoryInteractionHTML(html) {
  const items = [];
  const pattern = /<h2[^>]*>([^<]+)<\/h2>.*?<div class="_a6-p">.*?<div>([^<]*)<\/div>.*?<div>(\w{3} \d{1,2}, \d{4}[^<]*)<\/div>/gs;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    items.push({ title: m[1].trim(), string_list_data: [{ value: m[2].trim(), timestamp: parseHTMLDate(m[3]) }] });
  }
  return items;
}

/**
 * Read a data file from one or more directories.
 * Tries JSON first, falls back to HTML parsing.
 * If dirs is an array, reads from all dirs and merges.
 */
function readJSON(dirs, relPath) {
  if (!Array.isArray(dirs)) {
    return readJSONSingle(dirs, relPath) || readHTMLSingle(dirs, relPath);
  }

  const results = dirs.map(d => readJSONSingle(d, relPath) || readHTMLSingle(d, relPath)).filter(Boolean);
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  // Merge strategy
  const first = results[0];
  if (Array.isArray(first)) {
    return deduplicateArray(results.flat());
  }
  if (typeof first === 'object') {
    const merged = { ...first };
    for (let i = 1; i < results.length; i++) {
      for (const [key, val] of Object.entries(results[i])) {
        if (Array.isArray(val) && Array.isArray(merged[key])) {
          merged[key] = deduplicateArray(merged[key].concat(val));
        } else if (!(key in merged)) {
          merged[key] = val;
        }
      }
    }
    return merged;
  }
  return first;
}

/**
 * Deduplicate an array of objects using smart fingerprinting.
 * Identifies the object type from its fields and picks the best key.
 */
function deduplicateArray(arr) {
  if (!arr.length || typeof arr[0] !== 'object') return arr;
  const seen = new Set();
  const sample = arr[0];

  // Detect object shape and pick a fingerprint strategy
  let fpFn;
  if (sample.string_list_data) {
    // Follower/following/close-friends format: use value (username) or href
    fpFn = item => {
      const sld = item.string_list_data?.[0] || {};
      return sld.value || sld.href || item.title || JSON.stringify(item);
    };
  } else if (sample.title && sample.string_map_data) {
    // Saved posts, liked comments with title key
    fpFn = item => item.title + '|' + JSON.stringify(item.string_map_data);
  } else if (sample.timestamp !== undefined && sample.label_values) {
    // Liked posts / story likes format
    fpFn = item => {
      const url = item.label_values?.find(lv => lv.label === 'URL');
      return (url?.href || url?.value || '') + '|' + item.timestamp;
    };
  } else if (sample.string_map_data) {
    // Comments format
    fpFn = item => {
      const smd = item.string_map_data || {};
      return (smd.Comment?.value || '') + '|' + (smd.Time?.timestamp || '') + '|' + (smd['Media Owner']?.value || '');
    };
  } else {
    // Fallback: full JSON
    fpFn = item => JSON.stringify(item);
  }

  return arr.filter(item => {
    const fp = fpFn(item);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

function decodeUTF8(str) {
  if (!str) return str;
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

function tsToMonth(ts) {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bucketByMonth(timestamps) {
  const buckets = {};
  for (const ts of timestamps) {
    if (ts) {
      const m = tsToMonth(ts);
      buckets[m] = (buckets[m] || 0) + 1;
    }
  }
  return Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0])).map(([month, count]) => ({ month, count }));
}

function buildProfile(dir) {
  const raw = readJSON(dir, 'personal_information/personal_information/personal_information.json');
  if (!raw) return {};
  const info = raw.profile_user?.[0]?.string_map_data || {};
  return {
    username: info.Username?.value || '',
    name: decodeUTF8(info.Name?.value || ''),
    bio: decodeUTF8(info.Bio?.value || ''),
    website: info.Website?.value || '',
    privateAccount: info['Private Account']?.value === 'True',
    profilePhoto: raw.profile_user?.[0]?.media_map_data?.['Profile Photo']?.uri || '',
  };
}

function buildLikedPosts(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/likes/liked_posts.json');
  if (!raw || !Array.isArray(raw)) return { items: [], timeline: [], total: 0, firstTimestamp: null };

  const items = raw.map(item => {
    const ts = item.timestamp;
    let url = '';
    let ownerName = '';
    let ownerUsername = '';
    for (const lv of (item.label_values || [])) {
      if (lv.label === 'URL') url = lv.href || lv.value || '';
      if (lv.title === 'Owner' && lv.dict) {
        for (const d of lv.dict) {
          for (const entry of (d.dict || [])) {
            if (entry.label === 'Name') ownerName = decodeUTF8(entry.value || '');
            if (entry.label === 'Username') ownerUsername = entry.value || '';
          }
        }
      }
    }
    return { ts, url, ownerName, ownerUsername };
  });

  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildLikedComments(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/likes/liked_comments.json');
  const arr = raw?.likes_comment_likes || [];
  const items = [];
  for (const entry of arr) {
    for (const sld of (entry.string_list_data || [])) {
      items.push({ ts: sld.timestamp, url: sld.href || '', username: entry.title || '' });
    }
  }
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items: items.sort((a, b) => b.ts - a.ts),
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildStoryLikes(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/story_interactions/story_likes.json');
  if (!raw || !Array.isArray(raw)) return { items: [], timeline: [], total: 0, firstTimestamp: null };

  const items = raw.map(item => {
    const ts = item.timestamp;
    let url = '';
    let ownerUsername = '';
    for (const lv of (item.label_values || [])) {
      if (lv.label === 'URL') url = lv.href || lv.value || '';
      if (lv.title === 'Owner' && lv.dict) {
        for (const d of lv.dict) {
          for (const entry of (d.dict || [])) {
            if (entry.label === 'Username') ownerUsername = entry.value || '';
          }
        }
      }
    }
    return { ts, url, ownerUsername };
  });

  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items: items.sort((a, b) => b.ts - a.ts),
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildComments(dir) {
  // Comments can be paginated: post_comments_1.json, post_comments_2.json, etc.
  let postComments = [];
  for (let page = 1; page <= 50; page++) {
    const raw = readJSON(dir, `your_instagram_activity/comments/post_comments_${page}.json`);
    if (!raw) break;
    postComments = postComments.concat(Array.isArray(raw) ? raw : []);
  }
  const reelsRaw = readJSON(dir, 'your_instagram_activity/comments/reels_comments.json');
  const reelsComments = reelsRaw?.comments_reels_comments || [];

  const items = [];
  for (const c of (postComments || [])) {
    const smd = c.string_map_data || {};
    items.push({
      ts: smd.Time?.timestamp || 0,
      comment: decodeUTF8(smd.Comment?.value || ''),
      mediaOwner: smd['Media Owner']?.value || '',
      type: 'post',
    });
  }
  for (const c of reelsComments) {
    const smd = c.string_map_data || {};
    items.push({
      ts: smd.Time?.timestamp || 0,
      comment: decodeUTF8(smd.Comment?.value || ''),
      mediaOwner: smd['Media Owner']?.value || '',
      type: 'reel',
    });
  }

  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildFollowers(dir) {
  // Instagram paginates followers: followers_1.json, followers_2.json, etc.
  const items = [];
  for (let page = 1; page <= 50; page++) {
    const raw = readJSON(dir, `connections/followers_and_following/followers_${page}.json`);
    if (!raw) break;
    const arr = Array.isArray(raw) ? raw : [];
    for (const f of arr) {
      for (const sld of (f.string_list_data || [])) {
        items.push({ ts: sld.timestamp, username: sld.value || '', url: sld.href || '' });
      }
    }
  }
  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildFollowing(dir) {
  const raw = readJSON(dir, 'connections/followers_and_following/following.json');
  const arr = raw?.relationships_following || [];
  const items = arr.map(f => {
    const sld = f.string_list_data?.[0] || {};
    return { ts: sld.timestamp || 0, username: f.title || '', url: sld.href || '' };
  });
  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildBlocked(dir) {
  const raw = readJSON(dir, 'connections/followers_and_following/blocked_profiles.json');
  const arr = raw?.relationships_blocked_users || [];
  const items = arr.map(f => {
    const sld = f.string_list_data?.[0] || {};
    return { ts: sld.timestamp || 0, username: f.title || '', url: sld.href || '' };
  });
  items.sort((a, b) => b.ts - a.ts);
  return { items, total: items.length };
}

function buildUnfollowed(dir) {
  const raw = readJSON(dir, 'connections/followers_and_following/recently_unfollowed_profiles.json');
  const arr = raw?.relationships_unfollowed_users || [];
  const items = [];
  for (const f of arr) {
    for (const sld of (f.string_list_data || [])) {
      items.push({ ts: sld.timestamp || 0, username: sld.value || f.title || '', url: sld.href || '' });
    }
  }
  items.sort((a, b) => b.ts - a.ts);
  return { items, total: items.length };
}

function extractExif(media) {
  const exif = media.media_metadata?.photo_metadata?.exif_data?.[0];
  if (!exif) return null;
  const out = {};
  if (exif.lens_model) out.camera = exif.lens_model;
  else if (exif.lens_make) out.camera = exif.lens_make;
  if (exif.iso) out.iso = exif.iso;
  if (exif.focal_length) out.focalLength = exif.focal_length + 'mm';
  if (exif.date_time_original) out.taken = exif.date_time_original;
  if (exif.software) out.software = exif.software;
  if (exif.source_type) out.source = exif.source_type;
  return Object.keys(out).length ? out : null;
}

function buildPosts(dir) {
  // Posts can be paginated: posts_1.json, posts_2.json, etc.
  let raw = [];
  for (let page = 1; page <= 50; page++) {
    const pageData = readJSON(dir, `your_instagram_activity/media/posts_${page}.json`);
    if (!pageData) break;
    raw = raw.concat(Array.isArray(pageData) ? pageData : []);
  }
  if (raw.length === 0) return { items: [], timeline: [], total: 0, firstTimestamp: null };

  const items = raw.map(p => {
    const allMedia = p.media || [];
    const media = allMedia[0] || {};
    const mediaCount = allMedia.length;
    // For thumbnail: prefer first image over video
    const firstImage = allMedia.find(m => /\.(jpg|jpeg|png|webp)$/i.test(m.uri || ''));
    const thumbUri = firstImage?.uri || media.uri || '';
    return {
      ts: media.creation_timestamp || 0,
      title: decodeUTF8(media.title || ''),
      uri: thumbUri,
      allMedia: allMedia.map(m => ({ uri: m.uri || '', isVideo: /\.(mp4|mov)$/i.test(m.uri || '') })),
      mediaCount,
      exif: extractExif(media),
    };
  });
  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildArchivedPosts(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/media/archived_posts.json');
  const arr = raw?.ig_archived_post_media || [];

  const items = arr.map(p => {
    const media = p.media?.[0] || {};
    const mediaCount = (p.media || []).length;
    return {
      ts: media.creation_timestamp || 0,
      title: decodeUTF8(media.title || ''),
      uri: media.uri || '',
      mediaCount,
      exif: extractExif(media),
    };
  });
  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildSavedPosts(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/saved/saved_posts.json');
  const arr = raw?.saved_saved_media || [];
  const items = arr.map(s => {
    const smd = s.string_map_data?.['Saved on'] || {};
    return { ts: smd.timestamp || 0, url: smd.href || '', owner: s.title || '' };
  });
  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

function buildCloseFriends(dir) {
  const raw = readJSON(dir, 'connections/followers_and_following/close_friends.json');
  if (!raw) return { items: [], total: 0 };
  const arr = raw.relationships_close_friends || [];
  const items = arr.map(f => {
    const sld = f.string_list_data?.[0] || {};
    return { ts: sld.timestamp || 0, username: sld.value || f.title || '', url: sld.href || '' };
  });
  return { items, total: items.length };
}

// --- Stories ---
function buildStories(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/media/stories.json');
  const arr = raw?.ig_stories || [];

  const items = arr.map(s => ({
    ts: s.creation_timestamp || 0,
    title: decodeUTF8(s.title || ''),
    uri: s.uri || '',
    isVideo: (s.uri || '').endsWith('.mp4'),
  }));
  items.sort((a, b) => b.ts - a.ts);
  const timestamps = items.map(i => i.ts).filter(Boolean);
  return {
    items,
    timeline: bucketByMonth(timestamps),
    total: items.length,
    firstTimestamp: timestamps.length ? Math.min(...timestamps) : null,
  };
}

// --- Story Interactions ---
function buildStoryInteractions(dir) {
  const emojiRaw = readJSON(dir, 'your_instagram_activity/story_interactions/emoji_sliders.json');
  const pollsRaw = readJSON(dir, 'your_instagram_activity/story_interactions/polls.json');
  const questionsRaw = readJSON(dir, 'your_instagram_activity/story_interactions/questions.json');
  const quizzesRaw = readJSON(dir, 'your_instagram_activity/story_interactions/quizzes.json');

  function extractInteractions(arr, type) {
    const items = [];
    for (const entry of arr) {
      for (const sld of (entry.string_list_data || [])) {
        items.push({
          ts: sld.timestamp || 0,
          username: entry.title || '',
          value: decodeUTF8(sld.value || ''),
          type,
        });
      }
    }
    return items;
  }

  const all = [
    ...extractInteractions(emojiRaw?.story_activities_emoji_sliders || [], 'emoji'),
    ...extractInteractions(pollsRaw?.story_activities_polls || [], 'poll'),
    ...extractInteractions(questionsRaw?.story_activities_questions || [], 'question'),
    ...extractInteractions(quizzesRaw?.story_activities_quizzes || [], 'quiz'),
  ];
  all.sort((a, b) => b.ts - a.ts);

  return {
    items: all,
    total: all.length,
    emoji: (emojiRaw?.story_activities_emoji_sliders || []).reduce((n, e) => n + (e.string_list_data?.length || 0), 0),
    polls: (pollsRaw?.story_activities_polls || []).reduce((n, e) => n + (e.string_list_data?.length || 0), 0),
    questions: (questionsRaw?.story_activities_questions || []).reduce((n, e) => n + (e.string_list_data?.length || 0), 0),
    quizzes: (quizzesRaw?.story_activities_quizzes || []).reduce((n, e) => n + (e.string_list_data?.length || 0), 0),
  };
}

// --- Reposts ---
function buildReposts(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/media/reposts.json');
  if (!raw || !Array.isArray(raw)) return { items: [], total: 0 };

  function findInDicts(obj, label) {
    if (!obj) return '';
    if (obj.label === label) return obj.value || obj.href || '';
    if (Array.isArray(obj.dict)) {
      for (const d of obj.dict) {
        const r = findInDicts(d, label);
        if (r) return r;
      }
    }
    if (Array.isArray(obj)) {
      for (const d of obj) {
        const r = findInDicts(d, label);
        if (r) return r;
      }
    }
    return '';
  }

  const items = raw.map(item => {
    const ts = item.timestamp || 0;
    let text = '';
    let url = '';
    let ownerUsername = '';
    let ownerName = '';

    for (const lv of (item.label_values || [])) {
      if (lv.label === 'Text') text = decodeUTF8(lv.value || '');
      if (lv.title === 'Media') {
        url = findInDicts(lv, 'URL');
        ownerUsername = findInDicts(lv, 'Username');
        ownerName = decodeUTF8(findInDicts(lv, 'Name'));
      }
    }
    return { ts, text, url, ownerUsername, ownerName };
  });
  items.sort((a, b) => b.ts - a.ts);
  return { items, total: items.length };
}

// --- Profile Photos ---
function buildProfilePhotos(dir) {
  const raw = readJSON(dir, 'your_instagram_activity/media/profile_photos.json');
  const arr = raw?.ig_profile_picture || [];
  const seen = new Set();
  const items = [];

  for (const p of arr) {
    if (p.uri && !seen.has(p.uri)) {
      seen.add(p.uri);
      items.push({ ts: p.creation_timestamp || 0, uri: p.uri, title: decodeUTF8(p.title || '') });
    }
  }

  // Also grab profile photo from personal_information
  const piRaw = readJSON(dir, 'personal_information/personal_information/personal_information.json');
  const piUri = piRaw?.profile_user?.[0]?.media_map_data?.['Profile Photo']?.uri;
  if (piUri && !seen.has(piUri)) {
    seen.add(piUri);
    const piTs = piRaw?.profile_user?.[0]?.media_map_data?.['Profile Photo']?.creation_timestamp || 0;
    items.push({ ts: piTs, uri: piUri, title: '' });
  }

  items.sort((a, b) => b.ts - a.ts);
  return { items, total: items.length };
}

// --- Ads & Tracking (ported from build.py) ---
function buildAds(dir) {
  const raw = readJSON(dir, 'ads_information/instagram_ads_and_businesses/advertisers_using_your_activity_or_information.json');
  const advertisers = raw?.ig_custom_audiences_all_types || [];

  const dataFile = advertisers.filter(a => a.has_data_file_custom_audience);
  const remarketing = advertisers.filter(a => a.has_remarketing_custom_audience);
  const both = advertisers.filter(a => a.has_data_file_custom_audience && a.has_remarketing_custom_audience);

  const advertiserList = advertisers.map(a => {
    const types = [];
    if (a.has_data_file_custom_audience) types.push('data file');
    if (a.has_remarketing_custom_audience) types.push('remarketing');
    if (a.has_in_person_store_visit) types.push('in-store visit');
    return { name: decodeUTF8(a.advertiser_name || ''), types };
  }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  // Ad categories
  const catsRaw = readJSON(dir, 'ads_information/instagram_ads_and_businesses/other_categories_used_to_reach_you.json');
  let categories = [];
  if (catsRaw) {
    for (const lv of (catsRaw.label_values || [])) {
      if (lv.vec) categories = lv.vec.map(v => v.value || '');
    }
  }

  // Ads viewed
  const adsViewed = readJSON(dir, 'ads_information/ads_and_topics/ads_viewed.json') || [];

  // Posts not interested
  const notIntRaw = readJSON(dir, "ads_information/ads_and_topics/posts_you're_not_interested_in.json");
  const notInterested = notIntRaw?.impressions_history_posts_not_interested || [];

  // Off-Meta activity
  const offRaw = readJSON(dir, 'apps_and_websites_off_of_instagram/apps_and_websites/your_activity_off_meta_technologies.json');
  const offMeta = [];
  if (offRaw) {
    for (const entry of (offRaw.apps_and_websites_off_meta_activity || [])) {
      const events = entry.events || [];
      const eventTypes = {};
      for (const e of events) {
        const t = e.type || 'UNKNOWN';
        eventTypes[t] = (eventTypes[t] || 0) + 1;
      }
      offMeta.push({
        name: decodeUTF8(entry.name || ''),
        eventCount: events.length,
        eventTypes,
        lastEvent: events.reduce((max, e) => Math.max(max, e.timestamp || 0), 0),
      });
    }
  }
  offMeta.sort((a, b) => b.lastEvent - a.lastEvent);

  return {
    stats: {
      totalAdvertisers: advertisers.length,
      withDataFile: dataFile.length,
      withRemarketing: remarketing.length,
      withBoth: both.length,
      adsViewed: adsViewed.length,
      notInterested: notInterested.length,
      adCategories: categories.length,
      offMetaApps: offMeta.length,
    },
    categories,
    advertisers: advertiserList,
    offMeta,
  };
}

// --- Validate folders ---
function validateFolders(dirs) {
  const required = [
    'connections/followers_and_following',
    'your_instagram_activity',
    'personal_information',
  ];
  // Check that at least one dir has each required folder
  const missing = required.filter(p => {
    return !dirs.some(dir => {
      try { fs.accessSync(path.join(dir, p)); return true; } catch { return false; }
    });
  });
  if (missing.length > 0) {
    return { valid: false, error: `Missing expected folders: ${missing.join(', ')}. Make sure you selected the root of your Instagram data export (JSON format). If your export was split into multiple files, select all the unzipped folders at once.` };
  }

  return { valid: true };
}

/**
 * Auto-detect the actual data directories.
 * Users might select a parent folder that contains one or more Instagram export
 * subfolders (e.g. "instagram-username-2026-04-06-xxxxx/").
 * This function checks each selected dir and, if it doesn't directly contain
 * the expected folders, looks one level deeper for subdirs that do.
 */
function resolveDataDirs(selectedDirs) {
  const marker = 'personal_information';
  const resolved = [];

  for (const dir of selectedDirs) {
    // Check if this dir itself is a data root
    try {
      fs.accessSync(path.join(dir, marker));
      resolved.push(dir);
      continue;
    } catch {}

    // Otherwise, scan immediate subdirs for data roots
    try {
      const children = fs.readdirSync(dir, { withFileTypes: true });
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const childPath = path.join(dir, child.name);
        try {
          fs.accessSync(path.join(childPath, marker));
          resolved.push(childPath);
        } catch {}
      }
    } catch {}
  }

  return resolved;
}

// --- Main processing ---
// inputDirs can be a string (single folder) or array (multiple folders)
function processData(inputDirs, outputDir, onProgress) {
  const rawDirs = Array.isArray(inputDirs) ? inputDirs : [inputDirs];
  const dirs = resolveDataDirs(rawDirs);

  if (dirs.length === 0) {
    return { success: false, error: 'No Instagram data found in the selected folder(s). Make sure you selected the unzipped export folder (it should contain directories like personal_information/, connections/, etc.). If your export is still zipped, unzip it first.' };
  }

  const validation = validateFolders(dirs);
  if (!validation.valid) return { success: false, error: validation.error };

  fs.mkdirSync(outputDir, { recursive: true });

  const steps = [
    ['Processing profile...', () => buildProfile(dirs)],
    ['Processing liked posts...', () => buildLikedPosts(dirs)],
    ['Processing liked comments...', () => buildLikedComments(dirs)],
    ['Processing story likes...', () => buildStoryLikes(dirs)],
    ['Processing comments...', () => buildComments(dirs)],
    ['Processing followers...', () => buildFollowers(dirs)],
    ['Processing following...', () => buildFollowing(dirs)],
    ['Processing blocked profiles...', () => buildBlocked(dirs)],
    ['Processing unfollowed...', () => buildUnfollowed(dirs)],
    ['Processing posts...', () => buildPosts(dirs)],
    ['Processing saved posts...', () => buildSavedPosts(dirs)],
    ['Processing close friends...', () => buildCloseFriends(dirs)],
    ['Processing archived posts...', () => buildArchivedPosts(dirs)],
    ['Processing stories...', () => buildStories(dirs)],
    ['Processing story interactions...', () => buildStoryInteractions(dirs)],
    ['Processing reposts...', () => buildReposts(dirs)],
    ['Processing profile photos...', () => buildProfilePhotos(dirs)],
    ['Processing ads & tracking...', () => buildAds(dirs)],
  ];

  const results = {};
  const names = ['profile', 'likedPosts', 'likedComments', 'storyLikes', 'comments', 'followers', 'following', 'blocked', 'unfollowed', 'posts', 'savedPosts', 'closeFriends', 'archivedPosts', 'stories', 'storyInteractions', 'reposts', 'profilePhotos', 'ads'];

  for (let i = 0; i < steps.length; i++) {
    onProgress({ step: i + 1, total: steps.length + 1, message: steps[i][0] });
    results[names[i]] = steps[i][1]();
  }

  // Compute follow relationships
  const followerSet = new Set(results.followers.items.map(f => f.username));
  const followingSet = new Set(results.following.items.map(f => f.username));
  const notFollowingBack = results.following.items.filter(f => !followerSet.has(f.username));
  const youDontFollowBack = results.followers.items.filter(f => !followingSet.has(f.username));

  const summary = {
    profile: results.profile,
    stats: {
      likedPosts: results.likedPosts.total,
      likedComments: results.likedComments.total,
      storyLikes: results.storyLikes.total,
      totalLikesGiven: results.likedPosts.total + results.likedComments.total + results.storyLikes.total,
      commentsMade: results.comments.total,
      followers: results.followers.total,
      following: results.following.total,
      blocked: results.blocked.total,
      unfollowed: results.unfollowed.total,
      postsMade: results.posts.total,
      archivedPosts: results.archivedPosts.total,
      stories: results.stories.total,
      storyInteractions: results.storyInteractions.total,
      reposts: results.reposts.total,
      profilePhotos: results.profilePhotos.total,
      savedPosts: results.savedPosts.total,
      closeFriends: results.closeFriends.total,
      notFollowingBack: notFollowingBack.length,
      youDontFollowBack: youDontFollowBack.length,
    },
    firsts: {
      firstLikedPost: results.likedPosts.firstTimestamp,
      firstLikedComment: results.likedComments.firstTimestamp,
      firstComment: results.comments.firstTimestamp,
      firstFollower: results.followers.firstTimestamp,
      firstFollowing: results.following.firstTimestamp,
      firstPost: results.posts.firstTimestamp,
    },
  };

  onProgress({ step: steps.length + 1, total: steps.length + 1, message: 'Writing files...' });

  const write = (name, data) => fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data));

  write('summary.json', summary);
  write('timelines.json', {
    likedPosts: results.likedPosts.timeline,
    likedComments: results.likedComments.timeline,
    storyLikes: results.storyLikes.timeline,
    comments: results.comments.timeline,
    followers: results.followers.timeline,
    following: results.following.timeline,
    posts: results.posts.timeline,
    savedPosts: results.savedPosts.timeline,
    stories: results.stories.timeline,
  });
  write('liked-posts.json', results.likedPosts.items);
  write('liked-comments.json', results.likedComments.items);
  write('story-likes.json', results.storyLikes.items);
  write('comments.json', results.comments.items);
  write('followers.json', results.followers.items);
  write('following.json', results.following.items);
  write('blocked.json', results.blocked.items);
  write('unfollowed.json', results.unfollowed.items);
  write('posts.json', results.posts.items);
  write('saved-posts.json', results.savedPosts.items);
  write('close-friends.json', results.closeFriends.items);
  write('not-following-back.json', notFollowingBack);
  write('you-dont-follow-back.json', youDontFollowBack);
  write('archived-posts.json', results.archivedPosts.items);
  write('stories.json', results.stories.items);
  write('story-interactions.json', results.storyInteractions);
  write('reposts.json', results.reposts.items);
  write('profile-photos.json', results.profilePhotos.items);
  write('ads.json', results.ads);

  // Detect if any dir has JSON files (vs HTML-only)
  let hasJSON = false;
  for (const dir of dirs) {
    try {
      const likesDir = path.join(dir, 'your_instagram_activity/likes');
      const files = fs.readdirSync(likesDir);
      if (files.some(f => f.endsWith('.json'))) { hasJSON = true; break; }
    } catch {}
    try {
      const connDir = path.join(dir, 'connections/followers_and_following');
      const files = fs.readdirSync(connDir);
      if (files.some(f => f.endsWith('.json'))) { hasJSON = true; break; }
    } catch {}
  }

  return { success: true, resolvedDirs: dirs, htmlOnly: !hasJSON };
}

module.exports = { processData };
