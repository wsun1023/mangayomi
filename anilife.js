const mangayomiSources = [{
  name: "애니라이프", id: 780920260911803, baseUrl: "https://anilife01.tv",
  lang: "ko", typeSource: "single",
  iconUrl: "",
  dateFormat: "", dateFormatLocale: "", isNsfw: false, hasCloudflare: false,
  sourceCodeUrl: "https://raw.githubusercontent.com/wsun1023/mangayomi/main/anilife.js",
  apiUrl: "", version: "0.2.1", isManga: false, itemType: 1, isFullData: false,
  appMinVerReq: "0.9.2", additionalParams: "", sourceCodeLanguage: 1,
  pkgPath: "anime/src/ko/anilife.js",
  notes: "애니라이프 API 직접 연결 · 외부 중계 서버 의존성 제거 · 인기/최신/검색/필터 · 작품/회차 정보 · HTTP 쿠키 세션 재생 · 한국어/일본어 제목"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.defaultBase = "https://anilife01.tv";
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    this.client = new Client({timeout: 10, persistentConnection: false});
    this.cookies = {};
  }
  get supportsLatest() { return true; }
  get baseUrl() { return this._base(); }
  get base() { return this._base(); }
  _text(value) { return value == null ? "" : String(value); }
  _origin(url) { return (this._text(url).match(/^https?:\/\/[^/?#]+/i) || [""])[0].toLowerCase(); }
  _pref(key, fallback) {
    try { const value = new SharedPreferences().get(key); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  _base() {
    const value = this._text(this._pref("anilife_domain_url", "")).trim().replace(/\/+$/, "");
    return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) ? value.toLowerCase() : this.defaultBase;
  }
  _absolute(base, value) {
    const path = this._text(value).trim();
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return "https:" + path;
    const origin = this._origin(base);
    if (path.startsWith("/")) return origin + path;
    if (path.startsWith("?")) return base.replace(/[?#].*$/, "") + path;
    if (path.startsWith("#")) return base.replace(/#.*$/, "") + path;
    const relative = path.match(/^([^?#]*)([?#].*)?$/);
    const directory = base.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
    const parts = (directory.replace(origin, "") + relative[1]).split("/"), output = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") output.pop(); else output.push(part);
    }
    return origin + "/" + output.join("/") + (relative[2] || "");
  }
  _workUrl(id) { return this._base() + "/content/" + id + "/1"; }
  _workId(url) {
    const match = this._text(url).match(/\/(?:content|api\/anime)\/(\d+)(?:[/?#]|$)/);
    if (!match) throw new Error("애니라이프 작품 주소에 ID가 없습니다.");
    return match[1];
  }
  _episode(url) {
    const match = this._text(url).match(/\/(?:api\/playback|content)\/(\d+)\/(\d+(?:\.\d+)?)(?:[/?#]|$)/);
    if (!match) throw new Error("애니라이프 회차 주소가 올바르지 않습니다.");
    return {id: match[1], number: match[2]};
  }
  _title(item) {
    return this._text(this._pref("anilife_title_language_v2", "ko")) === "ja" && item.titleJp
      ? this._text(item.titleJp) : this._text(item.title || item.titleOriginal || ("작품 " + item.id));
  }
  _cover(value) {
    const url = this._absolute(this._base() + "/", value);
    return url && this._origin(url) === this._base() ? "https://wsrv.nl/?url=" + encodeURIComponent(url) : url;
  }
  getHeaders(url) {
    return {Referer: (this._origin(url) || this._base()) + "/", "User-Agent": this.userAgent, Accept: "*/*"};
  }

  _saveCookies(url, headers) {
    const origin = this._origin(url);
    // Anonymous site cookies stay in this provider instance, never in preferences.
    if (origin !== this._base() || !headers) return;
    let values;
    for (const key of Object.keys(headers)) if (key.toLowerCase() === "set-cookie") values = headers[key];
    if (!values) return;
    const rows = Array.isArray(values) ? values : this._text(values).split(/,(?=\s*[^;,=\s]+=)/);
    const jar = this.cookies[origin] || (this.cookies[origin] = Object.create(null));
    for (const row of rows) {
      const pair = this._text(row).split(";")[0].trim(), equals = pair.indexOf("=");
      if (equals <= 0) continue;
      const name = pair.slice(0, equals), value = pair.slice(equals + 1);
      const expires = /;\s*expires\s*=\s*([^;]+)/i.exec(row);
      if (/;\s*max-age\s*=\s*0(?:;|$)/i.test(row) || !value || expires && Date.parse(expires[1]) < Date.now()) delete jar[name];
      else jar[name] = value;
    }
  }
  _siteHeaders(referer) {
    const base = this._base();
    const headers = {Referer: referer || base + "/", Origin: base, "User-Agent": this.userAgent, Accept: "application/json, text/plain, */*"};
    const jar = this.cookies[base];
    if (jar && Object.keys(jar).length) headers.Cookie = Object.keys(jar).map(key => key + "=" + jar[key]).join("; ");
    return headers;
  }
  async _request(url, headers, body) {
    const response = body === undefined ? await this.client.get(url, headers) : await this.client.post(url, headers, body);
    this._saveCookies(url, response && response.headers);
    const status = Number(response && response.statusCode);
    if (!(status >= 200 && status < 300)) {
      let message = "HTTP " + (status || "응답 없음");
      try {
        const data = JSON.parse(this._text(response && response.body));
        if (typeof data.error === "string") message += " · " + data.error.slice(0, 200);
      } catch (_) {}
      const error = new Error(message); error.statusCode = status; throw error;
    }
    return response;
  }
  _json(response) {
    let data;
    try { data = JSON.parse(this._text(response.body).replace(/^\uFEFF/, "")); }
    catch (_) { throw new Error("애니라이프에서 JSON이 아닌 응답을 받았습니다."); }
    if (!data || typeof data !== "object" || data.error) throw new Error(this._text(data && data.error) || "애니라이프 응답이 비어 있습니다.");
    return data;
  }
  async _api(path, field) {
    if (!/^\/api\/anime(?:\/\d+)?(?:\?|$)/.test(path)) throw new Error("애니라이프 API 경로가 올바르지 않습니다.");
    const data = this._json(await this._request(this._base() + path, this._siteHeaders()));
    if (field === "items" ? !Array.isArray(data.items) : !data.item || typeof data.item !== "object") throw new Error("애니라이프 " + field + " 응답 형식이 올바르지 않습니다.");
    return data;
  }

  _select(type, name, pairs) {
    return {type, name, type_name: "SelectFilter", state: 0, values: pairs.map(pair => ({type_name: "SelectOption", name: pair[0], value: pair[1]}))};
  }
  getFilterList() {
    const years = [["전체", ""]];
    for (let year = new Date().getFullYear() + 1; year >= 1977; year--) years.push([String(year), String(year)]);
    return [
      this._select("sort", "정렬", [["최신순", "latest"], ["인기순", "popular"], ["평점순", "rating"], ["이름순", "title"]]),
      this._select("format", "형식", [["전체", ""], ["TV", "TV"], ["극장판", "Movie"], ["OVA", "OVA"], ["ONA", "ONA"]]),
      this._select("status", "상태", [["전체", ""], ["방영중", "방영중"], ["완결", "완결"], ["방영예정", "방영예정"]]),
      this._select("day", "요일", [["전체", ""], ["월", "월"], ["화", "화"], ["수", "수"], ["목", "목"], ["금", "금"], ["토", "토"], ["일", "일"]]),
      this._select("year", "연도", years)
    ];
  }
  _filters(filters) {
    const result = {};
    for (const filter of Array.isArray(filters) ? filters : []) {
      if (!filter || !["sort", "format", "status", "day", "year"].includes(filter.type) || !Array.isArray(filter.values)) continue;
      const option = filter.values[Number(filter.state) || 0];
      if (option && option.value != null) result[filter.type] = this._text(option.value);
    }
    return result;
  }
  async _catalog(page, criteria, query) {
    const options = criteria || {};
    const params = ["page=" + Math.max(1, Number(page) || 1), "limit=24", "v=catalog-media-2", "sort=" + encodeURIComponent(options.sort || "latest")];
    if (query) params.push("q=" + encodeURIComponent(this._text(query).trim()));
    for (const key of ["scope", "format", "status", "day", "year"]) if (options[key]) params.push(key + "=" + encodeURIComponent(options[key]));
    if (options.day && !options.status) params.push("status=" + encodeURIComponent("방영중"));
    const data = await this._api("/api/anime?" + params.join("&"), "items"), pagination = data.pagination || {};
    return {
      list: data.items.filter(item => item && /^\d+$/.test(this._text(item.id))).map(item => ({name: this._title(item), link: this._workUrl(item.id), imageUrl: this._cover(item.image)})),
      hasNextPage: Number(pagination.page || page || 1) < Number(pagination.pages || 1)
    };
  }
  async getPopular(page) { return this._catalog(page, {sort: "popular", scope: "popular"}, ""); }
  async getLatestUpdates(page) { return this._catalog(page, {sort: "latest", scope: "updates"}, ""); }
  async search(query, page, filters) { return this._catalog(page, this._filters(filters), this._text(query).trim()); }

  async getDetail(url) {
    const id = this._workId(url), data = await this._api("/api/anime/" + id + "?v=playback-url-v1", "item"), item = data.item;
    let rows = Array.isArray(item.episodes) ? item.episodes : [];
    if (!Array.isArray(item.episodes)) {
      const count = Math.min(2000, Math.max(0, Math.floor(Number(item.playableEpisode || item.episodeCount || item.numberOfEpisodes || item.episode) || 0)));
      rows = Array.from({length: count}, (_, index) => ({number: index + 1}));
    }
    const episodes = [], seen = {};
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!row || row.playable === false) continue;
      const number = row.number == null ? index + 1 : row.number;
      if (!/^\d+(?:\.\d+)?$/.test(this._text(number))) continue;
      const playbackUrl = this._absolute(this._base() + "/", row.playbackUrl || "/api/playback/" + id + "/" + number);
      if (seen[playbackUrl]) continue;
      seen[playbackUrl] = true;
      const title = this._text(row.title).trim(), label = number + "화", date = Date.parse(this._text(row.date));
      episodes.push({name: title && title !== label ? label + " · " + title : label, url: playbackUrl, dateUpload: Number.isFinite(date) ? String(date) : "", scanlator: "", isFiller: false});
    }
    episodes.reverse();
    return {
      name: this._title(item), link: this._workUrl(id), imageUrl: this._cover(item.image),
      description: this._text(item.description), author: [item.studio, item.director].filter(Boolean).join(" · "), artist: "",
      genre: Array.isArray(item.genres) ? item.genres : [], status: item.status === "완결" ? 1 : item.status === "방영예정" ? 4 : 0,
      episodes, chapters: episodes
    };
  }

  async _nativePlayback(info) {
    const base = this._base(), page = base + "/content/" + info.id + "/" + info.number;
    const api = base + "/api/playback/" + info.id + "/" + info.number + "?request=" + Date.now();
    try { return this._json(await this._request(api, this._siteHeaders(page))); }
    catch (error) {
      if (error.statusCode !== 401 && error.statusCode !== 403 && !/권한|PLAYBACK_FORBIDDEN/.test(this._text(error.message))) throw error;
    }
    // Best-effort HTTP cookie refresh. Live session acceptance needs site validation.
    await this._request(page, this._siteHeaders(base + "/"));
    try {
      const headers = this._siteHeaders(page); headers["Content-Type"] = "application/json";
      await this._request(base + "/api/playback/session", headers, {});
    } catch (_) {
      // Some versions establish a session on the page response.
    }
    return this._json(await this._request(api, this._siteHeaders(page)));
  }
  _mediaHeaders(page, stream) {
    const headers = {Referer: page, Origin: this._base(), "User-Agent": this.userAgent, Accept: "*/*"};
    if (this._origin(stream) === this._base()) {
      const cookie = this._siteHeaders(page).Cookie;
      if (cookie) headers.Cookie = cookie;
    }
    return headers;
  }
  async _variants(stream, headers) {
    if (!/\.m3u8(?:[?#]|$)/i.test(stream)) return [{url: stream, quality: "자동"}];
    try {
      const lines = this._text((await this._request(stream, headers)).body).split(/\r?\n/), variants = [];
      for (let index = 0; index < lines.length; index++) {
        if (!/^#EXT-X-STREAM-INF:/.test(lines[index].trim())) continue;
        let child = "";
        for (let next = index + 1; next < lines.length; next++) {
          const value = lines[next].trim();
          if (value && !value.startsWith("#")) { child = value; break; }
        }
        if (!child) continue;
        const height = (lines[index].match(/RESOLUTION=\d+x(\d+)/i) || [])[1];
        variants.push({url: this._absolute(stream, child), quality: height ? height + "p" : "자동 (HLS)"});
      }
      if (variants.length) return variants;
    } catch (_) {}
    return [{url: stream, quality: "자동 (HLS)"}];
  }
  async _videos(data, page) {
    const urls = [data.videoUrl, data.backupUrl].filter((value, index, list) => typeof value === "string" && value && list.indexOf(value) === index);
    const subtitles = this._pref("anilife_disable_site_subtitles", false) === true || !data.subtitleUrl ? [] : [{file: this._absolute(this._base() + "/", data.subtitleUrl), label: "사이트 자막"}];
    const videos = [], seen = {};
    for (const value of urls) {
      const stream = this._absolute(this._base() + "/", value);
      if (!/^https?:\/\//i.test(stream)) continue;
      for (const variant of await this._variants(stream, this._mediaHeaders(page, stream))) {
        if (seen[variant.url]) continue;
        seen[variant.url] = true;
        videos.push({url: variant.url, originalUrl: variant.url, quality: variant.quality, headers: this._mediaHeaders(page, variant.url), subtitles, audios: []});
      }
    }
    return videos;
  }
  async getVideoList(url) {
    const info = this._episode(url), page = this._base() + "/content/" + info.id + "/" + info.number;
    const videos = await this._videos(await this._nativePlayback(info), page);
    if (!videos.length) throw new Error("애니라이프 재생 응답에 영상 주소가 없습니다.");
    return videos;
  }

  getSourcePreferences() {
    return [
      {key: "anilife_domain_url", editTextPreference: {title: "사이트 주소", summary: "주소가 변경되면 새 주소를 입력하세요. 빈 값은 https://anilife01.tv를 사용합니다.", value: ""}},
      {key: "anilife_title_language_v2", listPreference: {title: "작품 제목 언어", summary: "사이트에서 제공하는 한국어 또는 일본어 제목을 표시합니다.", valueIndex: 0, entries: ["한국어", "일본어"], entryValues: ["ko", "ja"]}},
      {key: "anilife_disable_site_subtitles", switchPreferenceCompat: {title: "사이트 자막 끄기", summary: "사이트의 외부 자막을 플레이어에 전달하지 않습니다.", value: false}}
    ];
  }
  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
}
