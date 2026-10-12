const mangayomiSources = [{
  name: "re:ainme",
  lang: "en",
  baseUrl: "https://reanime.to",
  apiUrl: "https://reanime.to/api",
  iconUrl: "https://reanime.to/favicon.ico",
  typeSource: "single",
  itemType: 1,
  isNsfw: false,
  hasCloudflare: false,
  version: "0.1.1",
  dateFormat: "",
  dateFormatLocale: "",
  pkgPath: "anime/src/en/reanime.js",
  notes: "Re:ANIME v1 API · SvelteKit __data.json & SSR fallback · FlixCloud HLS & Subtitles · Custom Filters"
}];

class SvelteKitRefTable {
  constructor(data) {
    this.data = Array.isArray(data) ? data : [];
  }

  raw(index) {
    return (index >= 0 && index < this.data.length) ? this.data[index] : null;
  }

  obj(index) {
    const value = this.raw(index);
    return (value && typeof value === "object" && !Array.isArray(value)) ? value : null;
  }

  resolve(value) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < this.data.length) {
      return this.raw(value);
    }
    return value;
  }

  objRef(parent, key) {
    if (!parent || typeof parent !== "object") return null;
    const resolved = this.resolve(parent[key]);
    return (resolved && typeof resolved === "object" && !Array.isArray(resolved)) ? resolved : null;
  }

  arrayRef(parent, key) {
    if (!parent || typeof parent !== "object") return [];
    const resolved = this.resolve(parent[key]);
    if (Array.isArray(resolved)) {
      return resolved.map((item) => this.resolve(item));
    }
    return [];
  }

  stringRef(parent, key) {
    if (!parent || typeof parent !== "object") return "";
    const direct = parent[key];
    if (typeof direct === "number") {
      const resolved = this.raw(direct);
      if (typeof resolved === "string") return resolved.trim();
    }
    const val = this.resolve(direct);
    return (val !== null && val !== undefined) ? String(val).trim() : "";
  }

  intRef(parent, key) {
    if (!parent || typeof parent !== "object") return 0;
    const direct = parent[key];
    if (typeof direct === "number") {
      const resolved = this.raw(direct);
      if (typeof resolved === "number") return Math.floor(resolved);
      if (typeof resolved === "string" && /^-?\d+$/.test(resolved.trim())) return parseInt(resolved.trim(), 10);
      return Math.floor(direct);
    }
    if (typeof direct === "string" && /^-?\d+$/.test(direct.trim())) return parseInt(direct.trim(), 10);
    return 0;
  }

  boolRef(parent, key) {
    if (!parent || typeof parent !== "object") return false;
    const direct = parent[key];
    if (typeof direct === "number") {
      const resolved = this.raw(direct);
      if (typeof resolved === "boolean") return resolved;
    }
    return Boolean(this.resolve(direct));
  }

  stringArrayRef(parent, key) {
    const arr = this.arrayRef(parent, key);
    return arr.map((item) => {
      const val = this.resolve(item);
      return (val !== null && val !== undefined) ? String(val).trim() : "";
    }).filter(Boolean);
  }

  objectArrayRef(parent, key) {
    const arr = this.arrayRef(parent, key);
    return arr.map((item) => {
      const val = this.resolve(item);
      return (val && typeof val === "object" && !Array.isArray(val)) ? val : null;
    }).filter(Boolean);
  }

  dateRef(parent, key) {
    const dateObj = this.objRef(parent, key);
    if (!dateObj) return "";
    const day = this.intRef(dateObj, "day");
    const month = this.intRef(dateObj, "month");
    const year = this.intRef(dateObj, "year");
    if (!year || year <= 0) return "";
    const mm = String(month || 1).padStart(2, "0");
    const dd = String(day || 1).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }
}

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.baseUrl = "https://reanime.to";
    this.userAgent = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    this.prefTitleLanguage = "reanime_pref_title_lang";
    this.prefServerOrder = "reanime_pref_server_order";
  }

  get supportsLatest() {
    return true;
  }

  _text(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  _trimSlash(v) {
    return this._text(v).trim().replace(/\/+$/, "");
  }

  _preference(key, fallback) {
    try {
      const v = new SharedPreferences().get(key);
      return v === null || v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  _headers(referer) {
    return {
      "User-Agent": this.userAgent,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": referer || (this.baseUrl + "/")
    };
  }

  async _request(url, referer, isJson = true) {
    const transports = [
      { persistentConnection: false, noProxy: true, timeout: 20, connectTimeout: 10 },
      { useDartHttpClient: true, persistentConnection: false }
    ];
    let lastError = null;
    for (const options of transports) {
      try {
        const client = new Client(options);
        const headers = this._headers(referer);
        if (!isJson) {
          headers["Accept"] = "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8";
        }
        const resp = await client.get(url, headers);
        if (resp && resp.statusCode >= 200 && resp.statusCode < 300) {
          return this._text(resp.body);
        }
        lastError = new Error(`HTTP ${resp ? resp.statusCode : "Unknown"}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`Failed to request ${url}`);
  }

  _findRefTable(json) {
    if (!json || typeof json !== "object") return null;
    const nodes = json.nodes;
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
      if (node && Array.isArray(node.data) && node.data.length > 2) {
        return new SvelteKitRefTable(node.data);
      }
    }
    return null;
  }

  _looksLikeSlug(v) {
    if (!v || typeof v !== "string") return false;
    const text = v.trim().replace(/^\/+|\/+$/g, "");
    return text.includes("-") && !text.includes(" ") && !/^anime$/i.test(text) && !/^watch$/i.test(text);
  }

  _extractSlug(v) {
    if (!v || typeof v !== "string") return "";
    const clean = v.trim();
    const match = clean.match(/\/(?:anime|watch)\/([a-zA-Z0-9_\-]+)/i);
    if (match) return match[1];
    const stripped = clean.replace(/^[/#]+|[/#?].*$/g, "");
    if (this._looksLikeSlug(stripped)) return stripped;
    return stripped;
  }

  _titleLang() {
    const val = this._text(this._preference(this.prefTitleLanguage, "en")).trim().toLowerCase();
    if (val === "ja" || val === "native") return "native";
    if (val === "romaji") return "romaji";
    return "en";
  }

  _pickTitle(titleObj, rawTitle, slug) {
    const lang = this._titleLang();
    if (titleObj && typeof titleObj === "object") {
      const en = this._text(titleObj.english).trim();
      const ro = this._text(titleObj.romaji).trim();
      const ja = this._text(titleObj.native || titleObj.japanese).trim();
      if (lang === "native" && ja) return ja;
      if (lang === "romaji" && ro) return ro;
      if (en) return en;
      if (ro) return ro;
      if (ja) return ja;
    }
    const plain = this._text(rawTitle).trim();
    if (plain) return plain;
    return slug || "Untitled";
  }

  _parseAnimeCollection(jsonStr) {
    let root = null;
    try {
      root = JSON.parse(jsonStr);
    } catch (_) {
      return [];
    }
    if (!root) return [];

    let list = [];
    if (Array.isArray(root)) {
      list = root;
    } else if (typeof root === "object") {
      const candidates = ["data", "results", "anime", "animes", "items", "latest_aired", "top_weekly"];
      for (const key of candidates) {
        if (Array.isArray(root[key]) && root[key].length > 0) {
          list = root[key];
          break;
        }
      }
      if (!list.length) {
        for (const key of candidates) {
          if (root[key] && typeof root[key] === "object") {
            for (const nested of candidates) {
              if (Array.isArray(root[key][nested]) && root[key][nested].length > 0) {
                list = root[key][nested];
                break;
              }
            }
            if (list.length) break;
          }
        }
      }
    }

    const results = [];
    const seen = Object.create(null);

    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const anime = (item.anime && typeof item.anime === "object") ? item.anime : item;

      const rawSlug = this._text(anime.anime_id || item.anime_id || anime.slug || item.slug || "").trim();
      const detailUrl = this._text(anime.detailUrl || anime.detail_url || anime.url || item.url || "").trim();
      const slug = this._extractSlug(rawSlug) || this._extractSlug(detailUrl);

      const titleObj = (anime.title && typeof anime.title === "object") ? anime.title : (item.title && typeof item.title === "object" ? item.title : null);
      const rawTitle = this._text(anime.title || item.title || anime.name || item.name || "").trim();
      const title = this._pickTitle(titleObj, rawTitle, slug);
      if (!title) continue;

      const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (seen[finalSlug]) continue;
      seen[finalSlug] = true;

      const coverObj = (anime.cover_image && typeof anime.cover_image === "object") ? anime.cover_image : (item.cover_image && typeof item.cover_image === "object" ? item.cover_image : null);
      let poster = "";
      if (coverObj) {
        poster = this._text(coverObj.extra_large || coverObj.large || coverObj.medium || coverObj.url || "").trim();
      }
      if (!poster) {
        poster = this._text(anime.poster || item.poster || anime.image || item.image || "").trim();
      }

      results.push({
        name: title,
        link: `/anime/${finalSlug}`,
        imageUrl: poster
      });
    }

    return results;
  }

  async getPopular(page) {
    const currentPage = Math.max(1, Number(page) || 1);
    const limit = 36;
    const offset = (currentPage - 1) * limit;
    const url = `${this.baseUrl}/api/v1/search?limit=${limit}&offset=${offset}`;
    const json = await this._request(url, `${this.baseUrl}/search?limit=${limit}&offset=${offset}`);
    const list = this._parseAnimeCollection(json);
    return {
      list: list,
      hasNextPage: list.length >= limit
    };
  }

  async getLatestUpdates(page) {
    const currentPage = Math.max(1, Number(page) || 1);
    const limit = 36;
    const offset = (currentPage - 1) * limit;
    const url = `${this.baseUrl}/api/v1/search?limit=${limit}&offset=${offset}&status=RELEASING`;
    const json = await this._request(url, `${this.baseUrl}/search?limit=${limit}&offset=${offset}`);
    const list = this._parseAnimeCollection(json);
    return {
      list: list,
      hasNextPage: list.length >= limit
    };
  }

  async search(query, page, filters) {
    const currentPage = Math.max(1, Number(page) || 1);
    const limit = 36;
    const offset = (currentPage - 1) * limit;
    const params = [`limit=${limit}`, `offset=${offset}`];

    const q = this._text(query).trim();
    if (q) {
      params.push(`q=${encodeURIComponent(q)}`);
    }

    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (!f || !Array.isArray(f.values) || f.state === undefined || f.state === null) continue;
        const selected = f.values[Number(f.state) || 0];
        if (!selected || selected.value === undefined || selected.value === null || selected.value === "") continue;
        const val = this._text(selected.value).trim();
        if (!val || val === "__unset__") continue;

        if (f.type === "format") params.push(`format=${encodeURIComponent(val)}`);
        else if (f.type === "status") params.push(`status=${encodeURIComponent(val)}`);
        else if (f.type === "season") params.push(`season=${encodeURIComponent(val)}`);
        else if (f.type === "year") params.push(`year=${encodeURIComponent(val)}`);
        else if (f.type === "genre") params.push(`genre=${encodeURIComponent(val)}`);
      }
    }

    const url = `${this.baseUrl}/api/v1/search?${params.join("&")}`;
    const json = await this._request(url, `${this.baseUrl}/search`);
    const list = this._parseAnimeCollection(json);
    return {
      list: list,
      hasNextPage: list.length >= limit
    };
  }

  _parseDetailFromRefTable(table, slug) {
    const root = table.obj(0);
    if (!root) return null;
    const anime = table.objRef(root, "anime");
    if (!anime) return null;

    const titleObj = table.objRef(anime, "title");
    const title = this._pickTitle(
      titleObj,
      table.stringRef(anime, "title") || table.stringRef(anime, "english"),
      slug
    );

    const coverObj = table.objRef(anime, "cover_image");
    const poster = table.stringRef(coverObj, "extra_large") || table.stringRef(coverObj, "large") || table.stringRef(anime, "poster");

    const description = table.stringRef(anime, "description")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    const genres = table.stringArrayRef(anime, "genres");
    const studios = table.objectArrayRef(anime, "studios").map((s) => table.stringRef(s, "name")).filter(Boolean);

    const format = table.stringRef(anime, "format");
    const status = table.stringRef(anime, "status");
    const season = table.stringRef(anime, "season");
    const year = table.intRef(anime, "season_year") || table.intRef(anime, "year");
    const anilistId = table.intRef(anime, "anilist_id");
    const malId = table.intRef(anime, "mal_id");
    const episodesTotal = table.intRef(anime, "episodes_total");

    const startDate = table.dateRef(anime, "start_date");
    const endDate = table.dateRef(anime, "end_date");
    const aired = (startDate && endDate) ? `${startDate} ~ ${endDate}` : (startDate || "");

    const descLines = [];
    if (description) descLines.push(description);
    const metaInfo = [];
    if (format) metaInfo.push(`Format: ${format}`);
    if (status) metaInfo.push(`Status: ${status}`);
    if (season || year) metaInfo.push(`Season: ${[season, year].filter(Boolean).join(" ")}`);
    if (aired) metaInfo.push(`Aired: ${aired}`);
    if (studios.length) metaInfo.push(`Studios: ${studios.join(", ")}`);
    if (anilistId) metaInfo.push(`AniList ID: ${anilistId}`);
    if (malId) metaInfo.push(`MAL ID: ${malId}`);
    if (metaInfo.length) {
      descLines.push("─────────────\n" + metaInfo.join("\n"));
    }

    return {
      title,
      poster,
      description: descLines.join("\n\n"),
      genres,
      author: studios.join(", "),
      status: status.includes("RELEASING") ? 0 : (status.includes("FINISHED") ? 1 : 0),
      anilistId,
      malId,
      episodesTotal
    };
  }

  _parseWatchEpisodesFromRefTable(table, slug, anilistId) {
    const root = table.obj(0);
    if (!root) return [];
    const epRefs = table.arrayRef(root, "episodes");
    const episodes = [];

    for (const ref of epRefs) {
      const item = (typeof ref === "number") ? table.obj(ref) : (ref && typeof ref === "object" ? ref : null);
      if (!item) continue;
      const num = table.intRef(item, "number") || table.intRef(item, "episode_number");
      if (!num || num <= 0) continue;
      const epTitle = table.stringRef(item, "title") || `Episode ${num}`;
      const aired = table.stringRef(item, "aired");
      const dateUpload = this._parseDateEpoch(aired);

      episodes.push({
        number: num,
        name: epTitle.startsWith(`Episode ${num}`) ? epTitle : `${num}화 · ${epTitle}`,
        url: `/watch/${slug}?ep=${num}${anilistId ? "&aid=" + anilistId : ""}`,
        dateUpload: dateUpload
      });
    }

    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  }

  _parseDetailFromHtml(html, slug) {
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    const posterMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const poster = posterMatch ? posterMatch[1].trim() : "";

    const descMatch = html.match(/description\s*:\s*"((?:\\.|[^"])*)"/);
    const desc = descMatch ? descMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/<[^>]+>/g, "").trim() : "";

    const anilistMatch = html.match(/anilist_id\s*:\s*(\d+)/i);
    const anilistId = anilistMatch ? parseInt(anilistMatch[1], 10) : 0;

    const statusMatch = html.match(/status\s*:\s*"([^"]+)"/i);
    const statusStr = statusMatch ? statusMatch[1].toUpperCase() : "";

    const genres = [];
    const genreMatch = html.match(/genres\s*:\s*\[([^\]]*)\]/);
    if (genreMatch) {
      const gRegex = /"([^"]+)"/g;
      let gm;
      while ((gm = gRegex.exec(genreMatch[1])) !== null) {
        genres.push(gm[1]);
      }
    }

    const totalMatch = html.match(/episodes_total\s*:\s*(\d+)/i) || html.match(/total\s*:\s*(\d+)/i);
    const episodesTotal = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    return {
      title,
      poster,
      description: desc,
      genres,
      author: "",
      status: statusStr.includes("RELEASING") ? 0 : (statusStr.includes("FINISHED") ? 1 : 0),
      anilistId,
      malId: 0,
      episodesTotal
    };
  }

  _parseEpisodesFromHtml(html, slug, anilistId) {
    const episodes = [];
    const payloadStart = html.indexOf("episodes:{data:[") >= 0 ? html.indexOf("episodes:{data:[") : html.indexOf("episodes: {data:[");
    if (payloadStart >= 0) {
      const dataStart = html.indexOf("[", payloadStart);
      const dataEnd = html.indexOf("],limit:", dataStart) >= 0 ? html.indexOf("],limit:", dataStart) : html.indexOf("], limit:", dataStart);
      if (dataStart >= 0 && dataEnd > dataStart) {
        const payload = html.substring(dataStart + 1, dataEnd);
        const epRegex = /episode_number\s*:\s*(\d+)[^}]*?title\s*:\s*"((?:\\.|[^"])*)"/g;
        let em;
        while ((em = epRegex.exec(payload)) !== null) {
          const num = parseInt(em[1], 10);
          const t = em[2].replace(/\\"/g, "\"").trim() || `Episode ${num}`;
          episodes.push({
            number: num,
            name: `${num}화 · ${t}`,
            url: `/watch/${slug}?ep=${num}${anilistId ? "&aid=" + anilistId : ""}`,
            dateUpload: ""
          });
        }
      }
    }

    if (!episodes.length) {
      const linkRegex = /href=["']([^"']*\/watch\/[^"']*?ep=(\d+)[^"']*)["'][^>]*>([^<]*)</gi;
      let lm;
      const seen = Object.create(null);
      while ((lm = linkRegex.exec(html)) !== null) {
        const num = parseInt(lm[2], 10);
        if (seen[num]) continue;
        seen[num] = true;
        const rawTitle = lm[3].trim() || `Episode ${num}`;
        episodes.push({
          number: num,
          name: `${num}화 · ${rawTitle}`,
          url: `/watch/${slug}?ep=${num}${anilistId ? "&aid=" + anilistId : ""}`,
          dateUpload: ""
        });
      }
    }

    episodes.sort((a, b) => a.number - b.number);
    return episodes;
  }

  _parseDateEpoch(v) {
    if (!v) return "";
    const m = this._text(v).match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (!m) return "";
    return String(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  async getDetail(url) {
    const slug = this._extractSlug(url);
    if (!slug) throw new Error("Invalid Re:Anime URL: missing slug");

    let detail = null;
    let episodes = [];

    try {
      const dataUrl = `${this.baseUrl}/anime/${slug}/__data.json?x-appkit-invalidated=001`;
      const dataJson = await this._request(dataUrl, `${this.baseUrl}/anime/${slug}`);
      const parsed = JSON.parse(dataJson);
      const table = this._findRefTable(parsed);
      if (table) {
        detail = this._parseDetailFromRefTable(table, slug);
      }
    } catch (_) {}

    if (detail && detail.anilistId) {
      try {
        const watchDataUrl = `${this.baseUrl}/watch/${slug}/__data.json?x-appkit-invalidated=001`;
        const watchJson = await this._request(watchDataUrl, `${this.baseUrl}/anime/${slug}`);
        const parsedWatch = JSON.parse(watchJson);
        const watchTable = this._findRefTable(parsedWatch);
        if (watchTable) {
          episodes = this._parseWatchEpisodesFromRefTable(watchTable, slug, detail.anilistId);
        }
      } catch (_) {}
    }

    if (!detail || !episodes.length) {
      try {
        const pageHtml = await this._request(`${this.baseUrl}/anime/${slug}`, `${this.baseUrl}/`, false);
        if (!detail) {
          detail = this._parseDetailFromHtml(pageHtml, slug);
        }
        if (!episodes.length) {
          episodes = this._parseEpisodesFromHtml(pageHtml, slug, (detail && detail.anilistId) ? detail.anilistId : 0);
        }
      } catch (_) {}
    }

    if (!detail) {
      throw new Error(`Unable to fetch detail for Re:Anime slug: ${slug}`);
    }

    const total = Math.max(detail.episodesTotal || 0, episodes.length);
    if (total > 0 && episodes.length < total) {
      const existing = new Set(episodes.map((e) => e.number));
      for (let n = 1; n <= total; n++) {
        if (!existing.has(n)) {
          episodes.push({
            number: n,
            name: `Episode ${n}`,
            url: `/watch/${slug}?ep=${n}${detail.anilistId ? "&aid=" + detail.anilistId : ""}`,
            dateUpload: ""
          });
        }
      }
      episodes.sort((a, b) => a.number - b.number);
    }

    const episodeItems = episodes.map((ep) => ({
      name: ep.name,
      url: ep.url,
      dateUpload: ep.dateUpload || ""
    }));

    return {
      name: detail.title,
      link: `/anime/${slug}`,
      imageUrl: detail.poster,
      description: detail.description,
      author: detail.author || "",
      status: detail.status,
      genre: detail.genres || [],
      episodes: episodeItems,
      chapters: episodeItems
    };
  }

  _parseHlsVariants(masterM3u8, masterUrl, serverLabel) {
    const lines = this._text(masterM3u8).replace(/^\uFEFF/, "").split(/\r?\n/);
    const variants = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      let streamUrl = "";
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next.startsWith("#EXT-X-STREAM-INF:")) break;
        if (next && !next.startsWith("#")) {
          streamUrl = next;
          break;
        }
      }
      if (!streamUrl) continue;

      const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
      const nameMatch = line.match(/NAME="([^"]+)"/i);
      const height = resMatch ? resMatch[1] : "";
      const quality = height ? `${height}p` : (nameMatch ? nameMatch[1] : "Auto");

      let fullUrl = streamUrl;
      if (!/^https?:\/\//i.test(streamUrl)) {
        const base = masterUrl.substring(0, masterUrl.lastIndexOf("/") + 1);
        fullUrl = base + streamUrl;
      }

      variants.push({
        url: fullUrl,
        quality: `${serverLabel} · ${quality}`
      });
    }
    return variants;
  }

  _parseSubtitles(html) {
    const subtitles = [];
    const subMatch = html.match(/subtitles:\s*(\[[^\]]*\])/s);
    if (!subMatch) return subtitles;

    const regex = /\{[^{}]*?url\s*:\s*["']([^"']+)["'][^{}]*?\}/g;
    let m;
    const seen = Object.create(null);
    while ((m = regex.exec(subMatch[1])) !== null) {
      const u = m[1].replace(/\\/g, "").trim();
      if (!u.startsWith("http") || seen[u]) continue;
      seen[u] = true;

      const langMatch = m[0].match(/language\s*:\s*["']([^"']+)["']/i);
      const label = langMatch ? langMatch[1].trim() : "Subtitle";
      subtitles.push({
        url: u,
        label: label,
        lang: label.toLowerCase()
      });
    }
    return subtitles;
  }

  async _resolveFlixCandidates(anilistId, episodeNumber) {
    const url = `${this.baseUrl}/api/flix/${anilistId}/${episodeNumber}`;
    try {
      const json = await this._request(url, `${this.baseUrl}/`);
      const root = JSON.parse(json);
      const servers = Array.isArray(root.servers) ? root.servers : [];
      const candidates = [];
      for (const s of servers) {
        if (!s || typeof s !== "object") continue;
        const link = this._text(s.dataLink).trim();
        const name = this._text(s.serverName || "Server").trim();
        if (link.startsWith("https://flixcloud.cc/e/")) {
          candidates.push({ name, link });
        }
      }

      const orderPref = this._text(this._preference(this.prefServerOrder, "HD-2")).toUpperCase();
      candidates.sort((a, b) => {
        const aName = a.name.toUpperCase();
        const bName = b.name.toUpperCase();
        if (aName === orderPref) return -1;
        if (bName === orderPref) return 1;
        if (aName.includes("HD-2")) return -1;
        if (bName.includes("HD-2")) return 1;
        if (aName.includes("HD-1")) return -1;
        if (bName.includes("HD-1")) return 1;
        return 0;
      });

      return candidates;
    } catch (_) {
      return [];
    }
  }

  async getVideoList(url) {
    const slug = this._extractSlug(url);
    const epMatch = url.match(/[?&]ep=(\d+)/i);
    const episodeNumber = epMatch ? parseInt(epMatch[1], 10) : 1;

    let anilistId = 0;
    const aidMatch = url.match(/[?&]aid=(\d+)/i);
    if (aidMatch) {
      anilistId = parseInt(aidMatch[1], 10);
    }

    if (!anilistId && slug) {
      try {
        const detail = await this.getDetail(`/anime/${slug}`);
        if (detail && detail.description) {
          const aidm = detail.description.match(/AniList ID:\s*(\d+)/i);
          if (aidm) anilistId = parseInt(aidm[1], 10);
        }
      } catch (_) {}
    }

    if (!anilistId) {
      throw new Error(`Unable to resolve AniList ID for Re:Anime episode: ${url}`);
    }

    const candidates = await this._resolveFlixCandidates(anilistId, episodeNumber);
    if (!candidates.length) {
      throw new Error(`No FlixCloud playback servers returned for episode ${episodeNumber}`);
    }

    const videos = [];
    const seenUrls = Object.create(null);

    for (const cand of candidates) {
      const serverLabel = cand.name || "HD-2";
      try {
        const flixHtml = await this._request(cand.link, `${this.baseUrl}/`, false);
        const subtitles = this._parseSubtitles(flixHtml);

        const m3u8Match = flixHtml.match(/https?:\/\/[^"'<>\s]+\.m3u8(?:[^"'<>\s]*)?/i);
        if (m3u8Match) {
          const m3u8Url = m3u8Match[0];
          try {
            const masterContent = await this._request(m3u8Url, "https://flixcloud.cc/", false);
            if (masterContent.includes("#EXTM3U") && masterContent.includes("#EXT-X-STREAM-INF:")) {
              const variants = this._parseHlsVariants(masterContent, m3u8Url, serverLabel);
              for (const v of variants) {
                if (!seenUrls[v.url]) {
                  seenUrls[v.url] = true;
                  videos.push({
                    url: v.url,
                    originalUrl: v.url,
                    quality: v.quality,
                    headers: {
                      "User-Agent": this.userAgent,
                      "Referer": "https://flixcloud.cc/",
                      "Origin": "https://flixcloud.cc"
                    },
                    subtitles: subtitles
                  });
                }
              }
            }
          } catch (_) {}

          if (!seenUrls[m3u8Url]) {
            seenUrls[m3u8Url] = true;
            videos.push({
              url: m3u8Url,
              originalUrl: m3u8Url,
              quality: `${serverLabel} · Auto`,
              headers: {
                "User-Agent": this.userAgent,
                "Referer": "https://flixcloud.cc/",
                "Origin": "https://flixcloud.cc"
              },
              subtitles: subtitles
            });
          }
        }

        if (!videos.some((v) => v.quality.includes(serverLabel))) {
          videos.push({
            url: cand.link,
            originalUrl: cand.link,
            quality: `${serverLabel} (Direct)`,
            headers: {
              "User-Agent": this.userAgent,
              "Referer": `${this.baseUrl}/`
            },
            subtitles: subtitles
          });
        }
      } catch (_) {}
    }

    if (!videos.length) {
      throw new Error(`Re:Anime streaming servers could not be reached for episode ${episodeNumber}`);
    }

    return videos;
  }

  async getPageList() {
    return [];
  }

  async getHtmlContent() {
    return "";
  }

  async cleanHtmlContent(html) {
    return html;
  }

  getHeaders(url) {
    return {
      "User-Agent": this.userAgent,
      "Referer": (this.baseUrl + "/"),
      "Accept": "*/*"
    };
  }

  _option(name, value) {
    return { type_name: "SelectOption", name, value };
  }

  _select(type, name, values) {
    return { type, name, type_name: "SelectFilter", values };
  }

  getFilterList() {
    const o = this._option.bind(this);
    const sep = (type) => ({ type, name: "", type_name: "SeparatorFilter" });
    const head = (type, name) => ({ type, name, type_name: "HeaderFilter" });

    const formats = [
      o("All", "__unset__"), o("TV", "TV"), o("TV Short", "TV_SHORT"),
      o("Movie", "MOVIE"), o("Special", "SPECIAL"), o("OVA", "OVA"),
      o("ONA", "ONA"), o("Music", "MUSIC")
    ];

    const statuses = [
      o("All", "__unset__"), o("Releasing", "RELEASING"), o("Finished", "FINISHED"),
      o("Not Yet Released", "NOT_YET_RELEASED"), o("Cancelled", "CANCELLED"), o("Hiatus", "HIATUS")
    ];

    const seasons = [
      o("All", "__unset__"), o("Winter", "WINTER"), o("Spring", "SPRING"),
      o("Summer", "SUMMER"), o("Fall", "FALL")
    ];

    const currentYear = new Date().getFullYear();
    const yearOptions = [o("All", "__unset__")];
    for (let y = currentYear; y >= 1990; y--) {
      yearOptions.push(o(String(y), String(y)));
    }

    const genres = [
      o("All", "__unset__"), o("Action", "Action"), o("Adventure", "Adventure"),
      o("Comedy", "Comedy"), o("Drama", "Drama"), o("Ecchi", "Ecchi"),
      o("Fantasy", "Fantasy"), o("Horror", "Horror"), o("Mahou Shoujo", "Mahou Shoujo"),
      o("Mecha", "Mecha"), o("Music", "Music"), o("Mystery", "Mystery"),
      o("Psychological", "Psychological"), o("Romance", "Romance"), o("Sci-Fi", "Sci-Fi"),
      o("Slice of Life", "Slice of Life"), o("Sports", "Sports"),
      o("Supernatural", "Supernatural"), o("Thriller", "Thriller")
    ];

    return [
      head("h_format", "Format"),
      this._select("format", "Format", formats),
      sep("s_format"),
      head("h_status", "Status"),
      this._select("status", "Status", statuses),
      sep("s_status"),
      head("h_season", "Season"),
      this._select("season", "Season", seasons),
      sep("s_season"),
      head("h_year", "Release Year"),
      this._select("year", "Year", yearOptions),
      sep("s_year"),
      head("h_genre", "Genre"),
      this._select("genre", "Genre", genres)
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: this.prefTitleLanguage,
        listPreference: {
          title: "Title Display Language",
          summary: "Select preferred language for anime titles (English, Romaji, Japanese Native).",
          valueIndex: 0,
          entries: ["English", "Romaji", "Japanese (Native)"],
          entryValues: ["en", "romaji", "ja"]
        }
      },
      {
        key: this.prefServerOrder,
        listPreference: {
          title: "Preferred Streaming Server",
          summary: "First server to try when resolving playback streams.",
          valueIndex: 0,
          entries: ["HD-2 (Default / High Quality)", "HD-1"],
          entryValues: ["HD-2", "HD-1"]
        }
      }
    ];
  }
}
