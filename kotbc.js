const mangayomiSources = [{
  name: "코티비씨", id: 780920261014001, baseUrl: "https://k03.kotbc2.com",
  lang: "ko", typeSource: "single", iconUrl: "https://k03.kotbc2.com/kotbc_favicon_v1.png",
  dateFormat: "", dateFormatLocale: "", isNsfw: false, hasCloudflare: false,
  sourceCodeUrl: "https://raw.githubusercontent.com/wsun1023/mangayomi/main/kotbc.js",
  apiUrl: "", version: "0.1.0", isManga: false, itemType: 1, isFullData: false,
  appMinVerReq: "0.9.2", additionalParams: "", sourceCodeLanguage: 1,
  pkgPath: "anime/src/ko/kotbc.js",
  notes: "사이트 직접 연결 · 인기(평점순)/최신/검색 · 영화/드라마/예능시사/해외드라마 · 장르/연도 필터 · 회차 전체 페이지 · 직접 영상/외부 플레이어/HLS"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.defaultBase = "https://k03.kotbc2.com";
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    this.client = new Client({timeout: 15, persistentConnection: false});
  }
  get supportsLatest() { return true; }
  get baseUrl() { return this._base(); }
  get base() { return this._base(); }
  _text(value) { return value == null ? "" : String(value); }
  _pref(key, fallback) {
    try { const value = new SharedPreferences().get(key); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  _base() {
    const value = this._text(this._pref("kotbc_domain_url", "")).trim().replace(/\/+$/, "");
    return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) ? value.toLowerCase() : this.defaultBase;
  }
  _origin(url) { return (this._text(url).match(/^https?:\/\/[^/?#]+/i) || [""])[0].toLowerCase(); }
  _entities(value) {
    const named = {amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " "};
    return this._text(value).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity) => {
      if (entity[0] !== "#") return named[entity.toLowerCase()];
      const number = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : all;
    });
  }
  _attr(tag, name) {
    const match = this._text(tag).match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
    return match ? this._entities(match[1] == null ? match[2] == null ? match[3] : match[2] : match[1]) : "";
  }
  _absolute(base, value) {
    const path = this._entities(value).trim();
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return "https:" + path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return "";
    const origin = this._origin(base);
    if (path.startsWith("/")) return origin + path;
    if (path.startsWith("?")) return base.replace(/[?#].*$/, "") + path;
    const match = path.match(/^([^?#]*)([?#].*)?$/), parts = [];
    const directory = base.replace(/[?#].*$/, "").replace(/[^/]*$/, "").slice(origin.length);
    for (const part of (directory + match[1]).split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop(); else parts.push(part);
    }
    return origin + "/" + parts.join("/") + (match[2] || "");
  }
  _slug(value) {
    let text = this._text(value);
    if (!text) throw new Error("코티비씨 작품 또는 회차 주소가 비어 있습니다.");
    try { text = decodeURIComponent(text); } catch (_) {}
    return encodeURIComponent(text);
  }
  _workUrl(item) { return this._base() + "/" + this._slug(item.slug || item.content && item.content.slug); }
  _siteUrl(value) {
    let path = this._text(value).trim();
    if (/^https?:\/\//i.test(path)) path = path.slice(this._origin(path).length);
    if (!path.startsWith("/") || path.startsWith("//") || /[\s\\]/.test(path)) throw new Error("코티비씨 주소가 올바르지 않습니다.");
    return this._base() + path.replace(/[?#].*$/, "");
  }
  _cover(value) {
    const text = this._text(value).trim();
    return text ? this._absolute(this._base() + "/", /^(?:https?:|\/)/i.test(text) ? text : "/storage/" + text) : "";
  }
  getHeaders(url) { return {"User-Agent": this.userAgent, Referer: (this._origin(url) || this._base()) + "/", Accept: "text/html, application/json, */*"}; }
  async _request(url, referer) {
    const headers = this.getHeaders(url);
    if (referer) headers.Referer = referer;
    const response = await this.client.get(url, headers), status = Number(response && response.statusCode);
    if (!(status >= 200 && status < 300)) throw new Error((this._origin(url) === this._base() ? "코티비씨" : "코티비씨 영상 서버") + " HTTP " + (status || "응답 없음"));
    const body = this._text(response.body);
    if (!body.trim()) throw new Error("코티비씨 응답이 비어 있습니다.");
    return body;
  }
  _data(body) {
    let page;
    try {
      if (/^\s*\{/.test(body)) page = JSON.parse(body);
      else {
        const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = scripts.exec(body))) if (this._attr(match[1], "data-page") === "app" && this._attr(match[1], "type") === "application/json") { page = JSON.parse(match[2]); break; }
        if (!page) {
          const tag = (body.match(/<div\b[^>]*\bdata-page\s*=[^>]*>/i) || [""])[0];
          if (tag) page = JSON.parse(this._attr(tag, "data-page"));
        }
      }
    } catch (_) { throw new Error("코티비씨 페이지 JSON을 읽지 못했습니다."); }
    if (!page || !page.props || typeof page.props !== "object") throw new Error("코티비씨 작품 데이터를 찾지 못했습니다.");
    return page.props;
  }
  async _load(url) { return this._data(await this._request(url, this._base() + "/")); }
  _select(type, name, pairs) { return {type, name, type_name: "SelectFilter", state: 0, values: pairs.map(pair => ({type_name: "SelectOption", name: pair[0], value: pair[1]}))}; }
  getFilterList() {
    const genres = ["액션", "스릴러", "범죄", "공포", "미스터리", "재난", "드라마", "코미디", "로맨스", "멜로", "가족", "판타지", "SF", "어드벤처", "전쟁", "시대극", "무협", "서사", "역사", "서부", "음악", "스포츠", "애니메이션", "다큐멘터리", "뮤지컬", "전기", "공연"];
    const years = [["전체", ""]];
    for (let year = new Date().getFullYear(); year >= 2010; year--) years.push([String(year), String(year)]);
    years.push(["2005~2009", "2005-2009"], ["2000~2004", "2000-2004"], ["1990년대", "1990-1999"], ["1980년대", "1980-1989"], ["1979년 이전", "0-1979"]);
    return [this._select("category", "종류", [["전체", ""], ["영화", "영화"], ["드라마", "드라마"], ["예능시사", "예능시사"], ["해외드라마", "해외드라마"]]),
      this._select("sort", "정렬", [["업데이트 최신순", "update-desc"], ["평점 높은순", "rating-desc"], ["공개일 최신순", "release-desc"], ["제목 가나다순", "title-asc"]]),
      this._select("genre", "장르", [["전체", ""]].concat(genres.map(value => [value, value]))), this._select("year", "연도", years)];
  }
  _filters(filters) {
    const result = {};
    for (const row of Array.isArray(filters) ? filters : []) {
      if (!row || !["category", "sort", "genre", "year"].includes(row.type) || !Array.isArray(row.values)) continue;
      const option = row.values[Number(row.state) || 0];
      if (option && option.value != null) result[row.type] = this._text(option.value);
    }
    return result;
  }
  async _catalog(page, query, options) {
    const number = Math.max(1, Math.floor(Number(page) || 1)), settings = options || {};
    const category = ["영화", "드라마", "예능시사", "해외드라마"].includes(settings.category) ? settings.category : "";
    const params = ["page=" + number, "sort=" + encodeURIComponent(settings.sort || "update-desc")];
    if (query) params.push("keyword=" + encodeURIComponent(query));
    if (settings.genre) params.push("genres%5B0%5D=" + encodeURIComponent(settings.genre));
    if (settings.year) params.push("years%5B0%5D=" + encodeURIComponent(settings.year));
    const props = await this._load(this._base() + "/" + (category ? encodeURIComponent(category) : "") + "?" + params.join("&"));
    const data = props.comics;
    if (!data || !Array.isArray(data.data)) throw new Error("코티비씨 목록 응답 형식이 올바르지 않습니다.");
    const list = [], seen = {};
    for (const item of data.data) {
      if (!item || !item.title || !(item.slug || item.content && item.content.slug) || item.is_active === false) continue;
      const link = this._workUrl(item);
      if (seen[link]) continue;
      seen[link] = true; list.push({name: this._text(item.title), link, imageUrl: this._cover(item.thumbnail)});
    }
    return {list, hasNextPage: Number(data.current_page || number) < Number(data.last_page || 1)};
  }
  _category() { return this._text(this._pref("kotbc_category", "")); }
  async getPopular(page) { return this._catalog(page, "", {category: this._category(), sort: "rating-desc"}); }
  async getLatestUpdates(page) { return this._catalog(page, "", {category: this._category(), sort: "update-desc"}); }
  async search(query, page, filters) { return this._catalog(page, this._text(query).trim(), this._filters(filters)); }
  async getDetail(value) {
    const url = this._siteUrl(value), props = await this._load(url), item = props.comic || props.series;
    if (!item || !item.title || !item.slug) throw new Error("코티비씨 작품 정보를 찾지 못했습니다.");
    const episodes = [], seen = {};
    let data = props.episodes, number = 1;
    while (true) {
      if (!data || !Array.isArray(data.data)) throw new Error("코티비씨 회차 목록 형식이 올바르지 않습니다.");
      for (const row of data.data) {
        if (!row || !row.slug || row.deleted_at) continue;
        const target = this._workUrl(item) + "/" + this._slug(row.slug);
        if (seen[target]) continue;
        seen[target] = true;
        const date = Date.parse(this._text(row.published_at || row.created_at));
        episodes.push({name: this._text(row.title || row.sort && row.sort + "화" || "영상"), url: target, dateUpload: Number.isFinite(date) ? String(date) : "", scanlator: "", isFiller: false, order: Number(row.sort) || 0});
      }
      if (number >= Number(data.last_page || 1)) break;
      if (number >= 100) throw new Error("코티비씨 회차 목록이 100페이지를 초과했습니다.");
      const next = await this._load(url + "?page=" + (++number));
      if (!next.comic || next.comic.id !== item.id || Number(next.episodes && next.episodes.current_page) !== number) throw new Error("코티비씨 회차 페이지가 올바르게 이동하지 않았습니다.");
      data = next.episodes;
    }
    episodes.sort((a, b) => b.order - a.order);
    const chapters = episodes.map(row => ({name: row.name, url: row.url, dateUpload: row.dateUpload, scanlator: "", isFiller: false}));
    const genres = (Array.isArray(item.tags) ? item.tags : []).map(tag => typeof tag === "string" ? tag : typeof tag.name === "string" ? tag.name : tag.name && (tag.name.ko || tag.name.en)).filter(Boolean);
    if (!genres.length && item.tags_string) genres.push(...this._text(item.tags_string).split(",").map(value => value.trim()).filter(Boolean));
    return {name: this._text(item.title), link: this._workUrl(item), imageUrl: this._cover(item.thumbnail), description: this._text(item.description), author: [item.director, item.author, item.broadcaster].filter(Boolean).join(" · "), artist: "", genre: [...new Set(genres)], status: item.completed_at || item.category === "영화" ? 1 : 0, episodes: chapters, chapters};
  }
  _isMedia(url) { return /^https?:\/\//i.test(url) && /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url); }
  _literal(value) {
    try { return value[0] === '"' ? JSON.parse(value) : value.slice(1, -1).replace(/\\\//g, "/").replace(/\\u([a-f0-9]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))); }
    catch (_) { return ""; }
  }
  async _resolve(url, referer, depth, visited) {
    if (this._isMedia(url)) return [{url, referer}];
    if (!url || visited[url] || depth > 2) throw new Error("코티비씨 외부 플레이어에서 영상 주소를 찾지 못했습니다.");
    visited[url] = true;
    const html = await this._request(url, referer), found = [];
    for (const tag of html.match(/<(?:source|video)\b[^>]*>/gi) || []) {
      const media = this._absolute(url, this._attr(tag, "src"));
      if (this._isMedia(media)) found.push({url: media, referer: url});
    }
    for (const script of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []) {
      if (!/jwplayer|videojs|artplayer|sources|player_|Hls\b/i.test(script)) continue;
      const pattern = /["']?(?:file|src|url)["']?\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi;
      let match;
      while ((match = pattern.exec(script))) {
        const media = this._absolute(url, this._literal(match[1]));
        if (this._isMedia(media)) found.push({url: media, referer: url});
      }
    }
    if (found.length) return found;
    const frames = html.match(/<iframe\b[^>]*>/gi) || [];
    let lastError;
    for (const tag of frames.slice(0, 3)) {
      const frame = this._absolute(url, this._attr(tag, "src"));
      if (!frame) continue;
      try { return await this._resolve(frame, url, depth + 1, visited); } catch (error) { lastError = error; }
    }
    throw lastError || new Error("코티비씨 외부 플레이어에서 영상 주소를 찾지 못했습니다.");
  }
  async _variants(stream, referer) {
    if (!/\.m3u8(?:[?#]|$)/i.test(stream)) return [{url: stream, quality: "자동 (MP4)"}];
    try {
      const lines = (await this._request(stream, referer)).split(/\r?\n/), variants = [];
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
        let child = "";
        for (let next = index + 1; next < lines.length; next++) {
          const value = lines[next].trim();
          if (value.startsWith("#EXT-X-STREAM-INF:")) break;
          if (value && !value.startsWith("#")) { child = value; break; }
        }
        const url = this._absolute(stream, child);
        if (!this._isMedia(url)) continue;
        const height = (line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1];
        variants.push({url, quality: height ? height + "p" : "자동 (HLS)"});
      }
      if (variants.length) return [{url: stream, quality: "자동 (HLS)"}].concat(variants);
    } catch (_) {}
    return [{url: stream, quality: "자동 (HLS)"}];
  }
  async getVideoList(value) {
    const page = this._siteUrl(value), props = await this._load(page);
    const episode = props.playing || props.episode, body = episode && episode.body;
    if (!body || !body.url) throw new Error("코티비씨 회차에 영상 주소가 없습니다.");
    const streams = await this._resolve(this._absolute(page, body.url), page, 0, {}), videos = [], seen = {};
    const subtitle = this._absolute(page, body.subtitle_url || body.subtitleUrl);
    const subtitles = this._pref("kotbc_disable_site_subtitles", false) === true || !subtitle ? [] : [{file: subtitle, label: "사이트 자막"}];
    for (const stream of streams) {
      for (const variant of await this._variants(stream.url, stream.referer)) {
        if (seen[variant.url]) continue;
        seen[variant.url] = true;
        videos.push({url: variant.url, originalUrl: variant.url, quality: variant.quality, headers: {"User-Agent": this.userAgent, Referer: stream.referer, Origin: this._origin(stream.referer), Accept: "*/*"}, subtitles, audios: []});
      }
    }
    return videos;
  }
  getSourcePreferences() {
    return [
      {key: "kotbc_domain_url", editTextPreference: {title: "사이트 주소", summary: "기본값은 https://k03.kotbc2.com 입니다. 주소가 변경되면 새 주소를 입력하세요.", value: ""}},
      {key: "kotbc_category", listPreference: {title: "인기·최신 종류", summary: "인기는 사이트의 평점 높은순으로 표시합니다.", valueIndex: 0, entries: ["전체", "영화", "드라마", "예능시사", "해외드라마"], entryValues: ["", "영화", "드라마", "예능시사", "해외드라마"]}},
      {key: "kotbc_disable_site_subtitles", switchPreferenceCompat: {title: "사이트 자막 끄기", summary: "사이트가 제공하는 외부 자막을 플레이어에 전달하지 않습니다.", value: false}}
    ];
  }
  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
}
