const mangayomiSources = [{
  name: "링크애니", id: 780920260910801, baseUrl: "https://linkani.tv",
  lang: "ko", typeSource: "single", iconUrl: "",
  dateFormat: "", dateFormatLocale: "", isNsfw: false, hasCloudflare: false,
  sourceCodeUrl: "https://raw.githubusercontent.com/wsun1023/mangayomi/main/linkani.js",
  apiUrl: "", version: "0.2.0", isManga: false, itemType: 1, isFullData: false,
  appMinVerReq: "0.9.2", additionalParams: "", sourceCodeLanguage: 1,
  pkgPath: "anime/src/ko/linkani.js",
  notes: "처음부터 재작성 · 사이트 직접 연결 · 외부 중계 서버 의존성 제거 · 인기/최신/검색/분류 필터 · 상세 원제 · 회차/서버 구분 · HLS/MP4/자막"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.defaultBase = "https://linkani.tv";
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    this.client = new Client({timeout: 15, persistentConnection: false});
  }
  get supportsLatest() { return true; }
  get base() { return this._base(); }
  get baseUrl() { return this._base(); }
  _text(value) { return value == null ? "" : String(value); }
  _pref(key, fallback) {
    try { const value = new SharedPreferences().get(key); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  _base() {
    const value = this._text(this._pref("linkani_domain_url", "")).trim().replace(/\/+$/, "");
    return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value) ? value.toLowerCase() : this.defaultBase;
  }
  _origin(url) { return (this._text(url).match(/^https?:\/\/[^/?#]+/i) || [""])[0].toLowerCase(); }
  _absolute(base, value) {
    const path = this._entities(value).trim();
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return "https:" + path;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return "";
    const origin = this._origin(base);
    if (path.startsWith("/")) return origin + path;
    if (path.startsWith("?")) return base.replace(/[?#].*$/, "") + path;
    if (path.startsWith("#")) return base.replace(/#.*$/, "") + path;
    const relative = path.match(/^([^?#]*)([?#].*)?$/);
    const directory = base.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
    const output = [];
    for (const part of (directory.replace(origin, "") + relative[1]).split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") output.pop(); else output.push(part);
    }
    return origin + "/" + output.join("/") + (relative[2] || "");
  }
  _entities(value) {
    const named = {amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " "};
    return this._text(value).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity) => {
      if (entity[0] !== "#") return named[entity.toLowerCase()];
      const number = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : all;
    });
  }
  _clean(value) {
    return this._entities(this._text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\r]+/g, " ").trim();
  }
  _attr(tag, name) {
    const match = this._text(tag).match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
    return match ? this._entities(match[1] == null ? match[2] == null ? match[3] : match[2] : match[1]) : "";
  }
  _blocks(html, tag, className) {
    // Balanced same-tag containers keep nested divs and exact class tokens intact.
    const source = this._text(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
    const tokens = new RegExp("<\\/?" + tag + "\\b[^>]*>", "gi"), stack = [], found = [];
    let match;
    while ((match = tokens.exec(source))) {
      if (match[0][1] === "/") {
        const start = stack.pop();
        if (start && start.selected) found.push({index: start.index, html: source.slice(start.index, tokens.lastIndex)});
      } else if (!/\/\s*>$/.test(match[0])) {
        stack.push({index: match.index, selected: this._attr(match[0], "class").split(/\s+/).includes(className)});
      }
    }
    return found.sort((a, b) => a.index - b.index).map(row => row.html);
  }
  _links(html) {
    const result = [], pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(this._text(html)))) result.push({href: this._attr(match[1], "href"), name: this._clean(match[2]), attrs: match[1]});
    return result;
  }
  _meta(html, name) {
    for (const tag of this._text(html).match(/<meta\b[^>]*>/gi) || []) {
      if (this._attr(tag, "property") === name || this._attr(tag, "name") === name) return this._attr(tag, "content");
    }
    return "";
  }
  _image(html, base) {
    for (const tag of this._text(html).match(/<[^/!][^>]*>/g) || []) {
      const image = this._attr(tag, "data-original") || this._attr(tag, "data-src") || (/^<img\b/i.test(tag) ? this._attr(tag, "src") : "");
      if (image && !/loading\.(?:gif|png)/i.test(image)) return this._absolute(base, image);
    }
    return "";
  }
  getHeaders(url) { return {"User-Agent": this.userAgent, Referer: (this._origin(url) || this._base()) + "/", Accept: "*/*"}; }
  async _request(url, referer) {
    const headers = this.getHeaders(url);
    if (referer) headers.Referer = referer;
    const response = await this.client.get(url, headers), status = Number(response && response.statusCode);
    if (!(status >= 200 && status < 300)) throw new Error("링크애니 HTTP " + (status || "응답 없음"));
    const body = this._text(response.body);
    if (/warning(?:e\.kcopa)?\.or\.kr|접속이 차단|Access denied|Just a moment\.\.\./i.test(body)) throw new Error("링크애니 연결이 차단되었거나 브라우저 확인이 필요합니다.");
    if (!body.trim()) throw new Error("링크애니 응답이 비어 있습니다.");
    return body;
  }
  _page(page) { return Math.max(1, Math.floor(Number(page) || 1)); }
  _cards(html, url) {
    const result = [], seen = {};
    for (const block of this._blocks(html, "div", "vod-item")) {
      const heading = (block.match(/<h3\b[^>]*>[\s\S]*?<\/h3>/i) || [""])[0];
      const link = this._links(heading).find(row => /\/ani\/\d+\/?(?:[?#]|$)/.test(row.href));
      if (!link || !link.name) continue;
      const absolute = this._absolute(url, link.href);
      if (this._origin(absolute) !== this._base() || seen[absolute]) continue;
      seen[absolute] = true;
      result.push({name: link.name, link: absolute, imageUrl: this._image(block, url)});
    }
    return result;
  }
  async _catalog(path, page) {
    const url = this._base() + path, html = await this._request(url, this._base() + "/");
    const list = this._cards(html, url), pagination = this._blocks(html, "ul", "ewave-page").join("");
    const text = this._clean(html);
    const empty = /검색된.*없|결과가 없습니다|Anime\s*0\b|애니.*0\s*-/.test(text) || /검색 결과/.test(text) && /\+\s*0(?:\D|$)/.test(text);
    if (!list.length && (!empty || this._blocks(html, "div", "vod-item").length)) throw new Error("링크애니 작품 목록 형식을 확인할 수 없습니다.");
    const hasNextPage = this._links(pagination).some(row => {
      const target = this._absolute(url, row.href), next = target.match(/\/page\/(\d+)\//);
      return this._origin(target) === this._base() && next && Number(next[1]) > page;
    });
    return {list, hasNextPage};
  }
  async getPopular(page) {
    const number = this._page(page);
    return this._catalog("/label/topday/" + (number > 1 ? "page/" + number + "/" : ""), number);
  }
  async getLatestUpdates(page) {
    const number = this._page(page);
    return this._catalog("/list/2/" + (number > 1 ? "page/" + number + "/" : ""), number);
  }
  _select(type, name, pairs) { return {type, name, type_name: "SelectFilter", state: 0, values: pairs.map(pair => ({type_name: "SelectOption", name: pair[0], value: pair[1]}))}; }
  getFilterList() {
    const classes = ["월", "화", "수", "목", "금", "토", "일", "Action", "Webtoon", "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Adventure", "Avant Garde", "Boys Love", "Comedy", "Drama", "Fantasy", "Girls Love", "Gourmet", "Horror", "Supernatural", "Suspense", "Seinen", "Shoujo", "Shounen", "Military", "Music", "School", "CN Animation"];
    const years = [["전체", ""]];
    for (let year = new Date().getFullYear(); year >= 1990; year--) years.push([String(year), String(year)]);
    return [this._select("mode", "목록 구분", [["일반", "2"], ["16세 이상", "9"], ["인기 일간", "topday"]]),
      this._select("class", "분류·요일", [["전체", ""]].concat(classes.map(value => [value, value]))),
      this._select("type", "작품 형식", [["전체", ""], ["TV", "TV"], ["극장판", "Movie"], ["OVA", "OVA"]]),
      this._select("year", "방영 연도", years)];
  }
  _filters(filters) {
    const values = {};
    for (const filter of Array.isArray(filters) ? filters : []) {
      if (!filter || !["mode", "class", "type", "year"].includes(filter.type) || !Array.isArray(filter.values)) continue;
      const option = filter.values[Number(filter.state) || 0];
      if (option && option.value != null) values[filter.type] = this._text(option.value);
    }
    return values;
  }
  async search(query, page, filters) {
    const number = this._page(page), text = this._text(query).trim(), options = this._filters(filters);
    let path;
    if (text) path = "/view/" + (number > 1 ? "page/" + number + "/" : "") + "?wd=" + encodeURIComponent(text);
    else if (options.mode === "topday") path = "/label/topday/" + (number > 1 ? "page/" + number + "/" : "");
    else {
      path = "/list/" + (options.mode === "9" ? "9" : "2") + "/";
      for (const pair of [["class", options.class], ["lang", options.type], ["year", options.year]]) if (pair[1]) path += pair[0] + "/" + encodeURIComponent(pair[1]) + "/";
      if (number > 1) path += "page/" + number + "/";
    }
    return this._catalog(path, number);
  }
  _workUrl(value) {
    const id = this._text(value).match(/\/ani\/(\d+)\/?(?:[?#]|$)/);
    if (!id) throw new Error("링크애니 작품 주소가 올바르지 않습니다.");
    return this._base() + "/ani/" + id[1] + "/";
  }
  async getDetail(value) {
    const url = this._workUrl(value), html = await this._request(url, this._base() + "/");
    const info = this._blocks(html, "div", "detail-info").join("");
    const heading = info.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const korean = heading ? this._clean(heading[1]) : this._meta(html, "og:title").replace(/\s*다시보기.*$/, "").trim();
    if (!korean) throw new Error("링크애니 작품 정보를 찾지 못했습니다.");
    const original = html.match(/<strong\b[^>]*>\s*원제\s*[：:]\s*<\/strong>\s*<\/span>\s*([^<]+)/i);
    const japanese = original ? this._clean(original[1]) : "";
    const rows = [], seen = {}, id = url.match(/\/ani\/(\d+)/)[1];
    for (const block of this._blocks(html, "li", "episodelist")) {
      const link = this._links(block).find(row => /\/watch\/\d+\/a\d+\/k\d+(?:\.\d+)?\/?(?:[?#]|$)/.test(row.href));
      if (!link) continue;
      const match = link.href.match(/\/watch\/(\d+)\/a(\d+)\/k(\d+(?:\.\d+)?)/);
      if (match[1] !== id) continue;
      const target = this._base() + "/watch/" + id + "/a" + match[2] + "/k" + match[3] + "/";
      if (seen[target]) continue;
      seen[target] = true;
      const label = !link.name || /^\d+(?:\.\d+)?$/.test(link.name) ? match[3] + "화" : link.name;
      rows.push({number: Number(match[3]), server: Number(match[2]), name: label, url: target, dateUpload: "", scanlator: "", isFiller: false});
    }
    const servers = [...new Set(rows.map(row => row.server))];
    const episodes = rows.sort((a, b) => b.number - a.number || a.server - b.server).map(row => ({name: row.name + (servers.length > 1 ? " (서버 " + row.server + ")" : ""), url: row.url, dateUpload: "", scanlator: "", isFiller: false}));
    const genres = [...new Set(this._links(info).filter(row => /\/class\//.test(row.href)).map(row => row.name).filter(Boolean))];
    const studio = this._links(info).filter(row => /\/director\//.test(row.href)).map(row => row.name).join(" · ");
    const statusRow = (info.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []).map(row => this._clean(row)).find(row => /^(?:방영)?상태\s*[：:]/.test(row)) || "";
    return {name: this._pref("linkani_title_language_v2", "ko") === "ja" && japanese ? japanese : korean, link: url,
      imageUrl: this._image(this._blocks(html, "div", "detail-img").join(""), url) || this._absolute(url, this._meta(html, "og:image")),
      description: this._meta(html, "description") || this._meta(html, "og:description"), author: studio, artist: "", genre: genres,
      status: /완결|방영종료/.test(statusRow) ? 1 : 0, episodes, chapters: episodes};
  }
  _player(html) {
    // Extract balanced JSON without executing page scripts or truncating braces inside strings.
    const start = /(?:var|let|const)\s+player_[a-z0-9_]+\s*=\s*/i.exec(html);
    if (!start) return null;
    const offset = start.index + start[0].length;
    if (html[offset] !== "{") throw new Error("링크애니 플레이어 데이터 형식이 올바르지 않습니다.");
    let depth = 0, quoted = false, escaped = false;
    for (let index = offset; index < html.length; index++) {
      const character = html[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "{") depth++;
      else if (character === "}" && --depth === 0) {
        try { return JSON.parse(html.slice(offset, index + 1)); }
        catch (_) { throw new Error("링크애니 플레이어 JSON을 읽지 못했습니다."); }
      }
    }
    throw new Error("링크애니 플레이어 데이터가 잘렸습니다.");
  }
  _decode(value, encryption) {
    let text = this._text(value);
    if (Number(encryption) === 2) {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      let buffer = 0, bits = 0, decoded = "";
      for (const character of text.replace(/\s+/g, "").replace(/=+$/, "")) {
        const digit = alphabet.indexOf(character);
        if (digit < 0) throw new Error("링크애니 영상 주소 인코딩이 올바르지 않습니다.");
        buffer = (buffer << 6) | digit; bits += 6;
        if (bits >= 8) { bits -= 8; decoded += String.fromCharCode((buffer >> bits) & 255); }
      }
      text = decoded;
    }
    if (Number(encryption) === 1 || Number(encryption) === 2 && /^(?:https?%3a|%2f%2f)/i.test(text)) {
      try { text = decodeURIComponent(text); } catch (_) { throw new Error("링크애니 영상 주소를 해석하지 못했습니다."); }
    }
    return text;
  }
  async _variants(stream, page) {
    if (!/\.m3u8(?:[?#]|$)/i.test(stream)) return [{url: stream, quality: "자동 (MP4)"}];
    try {
      const lines = (await this._request(stream, page)).split(/\r?\n/), result = [];
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
        let child = "";
        for (let next = index + 1; next < lines.length; next++) {
          if (lines[next].trim().startsWith("#EXT-X-STREAM-INF:")) break;
          if (lines[next].trim() && !lines[next].trim().startsWith("#")) { child = lines[next].trim(); break; }
        }
        const url = this._absolute(stream, child);
        if (!url) continue;
        const height = (line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1];
        result.push({url, quality: height ? height + "p" : "자동 (HLS)"});
      }
      if (result.length) return [{url: stream, quality: "자동 (HLS)"}].concat(result);
    } catch (_) {}
    return [{url: stream, quality: "자동 (HLS)"}];
  }
  async getVideoList(value) {
    const episode = this._text(value).match(/\/watch\/(\d+)\/a(\d+)\/k(\d+(?:\.\d+)?)/);
    if (!episode) throw new Error("링크애니 회차 주소가 올바르지 않습니다.");
    const page = this._base() + "/watch/" + episode[1] + "/a" + episode[2] + "/k" + episode[3] + "/";
    const html = await this._request(page, this._base() + "/"), player = this._player(html), candidates = [];
    if (player) {
      if (player.actual_url) candidates.push(this._absolute(page, player.actual_url));
      if (player.url) candidates.push(this._absolute(page, this._decode(player.url, player.encrypt)));
    }
    for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
      if (this._attr(tag, "class").split(/\s+/).includes("btn-switch-server")) candidates.push(this._absolute(page, this._attr(tag, "data-url")));
    }
    for (const tag of html.match(/<(?:source|video)\b[^>]*>/gi) || []) candidates.push(this._absolute(page, this._attr(tag, "src")));
    const streams = [...new Set(candidates.filter(url => /^https?:\/\//i.test(url) && /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(url)))];
    if (!streams.length) throw new Error("링크애니 재생 페이지에서 영상 주소를 찾지 못했습니다.");
    const disabled = this._pref("linkani_disable_site_subtitles", false);
    const subtitle = player && this._absolute(page, player.subtitle_url);
    const subtitles = disabled === true || disabled === "true" || !subtitle ? [] : [{file: subtitle, label: "사이트 자막"}];
    const videos = [], seen = {};
    for (let index = 0; index < streams.length; index++) {
      for (const variant of await this._variants(streams[index], page)) {
        if (seen[variant.url]) continue;
        seen[variant.url] = true;
        videos.push({url: variant.url, originalUrl: variant.url, quality: variant.quality + (streams.length > 1 ? " · 서버 " + (index + 1) : ""),
          headers: {"User-Agent": this.userAgent, Referer: page, Origin: this._base(), Accept: "*/*"}, subtitles, audios: []});
      }
    }
    return videos;
  }
  getSourcePreferences() {
    return [
      {key: "linkani_domain_url", editTextPreference: {title: "사이트 주소", summary: "기본값은 https://linkani.tv 입니다. 사이트 주소가 변경되면 새 주소를 입력하세요.", value: ""}},
      {key: "linkani_title_language_v2", listPreference: {title: "상세 제목 언어", summary: "상세에서 사이트 원제를 표시합니다. 목록은 사이트에 표기된 제목을 사용합니다.", valueIndex: 0, entries: ["한국어", "원제"], entryValues: ["ko", "ja"]}},
      {key: "linkani_disable_site_subtitles", switchPreferenceCompat: {title: "사이트 자막 끄기", summary: "사이트 외부 자막을 플레이어에 전달하지 않습니다.", value: false}}
    ];
  }
  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
}
