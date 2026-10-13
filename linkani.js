const mangayomiSources = [{
  name: "링크애니",
  id: 780920260910801,
  baseUrl: "https://linkani.tv",
  lang: "ko",
  typeSource: "single",
  iconUrl: "https://dc-toki-mangayomi-media.pages.dev/icon/ko.linkkf-anime.png",
  dateFormat: "",
  dateFormatLocale: "",
  isNsfw: false,
  hasCloudflare: false,
  sourceCodeUrl: "https://raw.githubusercontent.com/wsun1023/mangayomi/main/linkani.js",
  apiUrl: "",
  version: "0.1.0",
  isManga: false,
  itemType: 1,
  isFullData: false,
  appMinVerReq: "0.9.2",
  additionalParams: "",
  sourceCodeLanguage: 1,
  pkgPath: "anime/src/ko/linkani.js",
  notes: "https://linkani.tv 신규 지원 · 인기(TOP 일간) 및 최신 업데이트 연동 · 요일/장르/연도/형식 필터 지원 · MacCMS HLS 자동 해석 및 다중 화질 스트리밍 · 포스터 이미지 CDN 우회 · 한국어/일본어 원제 표시 옵션"
}];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.fallbackBaseUrl = "https://linkani.tv";
    this.signalUrl = "https://wankyo83.github.io/tokki-traffic-light/domains.json";
    this.assetBaseUrl = "https://dc-toki-mangayomi-media.pages.dev";
    this.eventManifestUrl = this.assetBaseUrl + "/assets/official-event-card.json";
    this.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    this.titleLanguagePreference = "linkani_title_language_v2";
    this.titleCachePrefix = "linkani_title_meta_v1_";
    this._memCache = new Map();
  }

  get supportsLatest() { return true; }
  get base() { return this.fallbackBaseUrl; }
  get baseUrl() { return this.fallbackBaseUrl; }

  async _clearTransportFailure() {
    try {
      const client = new Client({ persistentConnection: false, noProxy: true, timeout: 5 });
      await client.get(this.eventManifestUrl + "?ping=" + Date.now(), { Accept: "application/json" });
    } catch (_) {}
  }

  _text(value) { return value === null || value === undefined ? "" : String(value); }
  _trimSlash(value) { return this._text(value).trim().replace(/\/+$/, ""); }
  _origin(value) { const match = this._text(value).match(/^(https?:\/\/[^/]+)/i); return match ? match[1] : ""; }
  _isHttpsOrigin(value) { return /^https:\/\/[^\s/]+\/?$/i.test(this._text(value).trim()); }

  _preference(key, fallback) {
    try { const value = new SharedPreferences().get(key); return value === null || value === undefined ? fallback : value; }
    catch (_) { return fallback; }
  }
  _preferenceString(key, fallback) {
    try { const value = new SharedPreferences().getString(key, fallback); return value === null || value === undefined ? fallback : this._text(value); }
    catch (_) { return fallback; }
  }
  _setPreferenceString(key, value) {
    try { new SharedPreferences().setString(key, this._text(value)); } catch (_) {}
  }

  _siteSubtitlesDisabled() {
    const value = this._preference("linkani_disable_site_subtitles", false);
    return value === true || this._text(value).toLowerCase() === "true" || this._text(value) === "1";
  }

  _titleLanguage() {
    const value = this._text(this._preference(this.titleLanguagePreference, this._preferenceString(this.titleLanguagePreference, "ko"))).trim().toLowerCase();
    return value === "ja" || value === "1" || value.indexOf("일본") >= 0 ? "ja" : "ko";
  }
  async _freshDetailTitleLanguage() {
    if (typeof setTimeout === "function") await new Promise(function(resolve) { setTimeout(resolve, 250); });
    return this._titleLanguage();
  }

  _clientOrder() {
    return ["rhttp", "dart"];
  }
  _client(kind, timeout) {
    if (kind === "rhttp") return new Client({ persistentConnection: false, noProxy: true, timeout: timeout || 15, connectTimeout: 8 });
    return new Client({ useDartHttpClient: true, persistentConnection: false, timeout: timeout || 15, connectTimeout: 8 });
  }

  async _clientGet(url, headers, timeout) {
    let lastError = null;
    for (const kind of this._clientOrder()) {
      try {
        const client = this._client(kind, timeout);
        const response = await client.get(url, headers || {});
        if (response && response.statusCode >= 200 && response.statusCode < 400) return response;
        lastError = new Error("HTTP " + (response ? response.statusCode : "unknown"));
      } catch (err) { lastError = err; }
    }
    throw lastError || new Error("요청 실패: " + url);
  }

  getHeaders(url) {
    const origin = this._origin(url) || this.fallbackBaseUrl;
    return {
      "User-Agent": this.userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Referer": origin + "/",
      "Origin": origin
    };
  }

  async _requestText(url, referer, timeout) {
    const headers = this.getHeaders(url);
    if (referer) headers.Referer = referer;
    const response = await this._clientGet(url, headers, timeout || 15);
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("HTTP " + response.statusCode);
    return this._text(response.body);
  }

  async _resolveBaseUrl() {
    const manual = this._trimSlash(this._preference("linkani_domain_url", ""));
    if (this._isHttpsOrigin(manual)) return manual;
    const cached = this._trimSlash(this._preferenceString("linkani_resolved_base", ""));
    const cachedAt = Number(this._preferenceString("linkani_resolved_base_time", "0"));
    if (this._isHttpsOrigin(cached) && cachedAt > 0 && Date.now() - cachedAt < 10 * 60 * 1000) return cached;
    try {
      const join = this.signalUrl.indexOf("?") >= 0 ? "&" : "?";
      const body = await this._requestText(this.signalUrl + join + "linkani=" + Date.now(), this.signalUrl, 8);
      const data = JSON.parse(body);
      const candidate = this._trimSlash(data && data.domains && (data.domains.linkani || data.domains.linkkf) && (data.domains.linkani?.baseUrl || data.domains.linkkf?.baseUrl));
      if (this._isHttpsOrigin(candidate)) {
        this._setPreferenceString("linkani_resolved_base", candidate);
        this._setPreferenceString("linkani_resolved_base_time", String(Date.now()));
        return candidate;
      }
    } catch (_) {}
    return this._isHttpsOrigin(cached) ? cached : this.fallbackBaseUrl;
  }

  absolute(base, path) {
    const value = this._text(path).trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return "https:" + value;
    return this._trimSlash(base) + (value.startsWith("/") ? value : "/" + value);
  }

  _coverImageUrl(base, raw) {
    const text = this._text(raw).trim();
    if (!text || text.includes("loading.gif")) return "";
    const url = this.absolute(base, text);
    if (/^https?:\/\//i.test(url) && (url.includes("/anime_uploads/") || url.includes("linkani") || url.includes("anilife") || url.includes("toki56"))) {
      return "https://wsrv.nl/?url=" + encodeURIComponent(url);
    }
    return url;
  }

  // --- HTML Parsing Helpers ---
  _extractCards(html, base) {
    const cards = [];
    const seen = new Set();
    const docText = this._text(html);

    if (typeof Document !== "undefined") {
      try {
        const doc = new Document(docText);
        const items = doc.select(".vod-item");
        if (Array.isArray(items) && items.length) {
          for (const item of items) {
            const titleEl = item.selectFirst(".vod-item-title a") || item.selectFirst("h3 a");
            const linkEl = item.selectFirst("a.vod-item-img") || titleEl || item.selectFirst("a[href*='/ani/']");
            if (!linkEl || !linkEl.node) continue;
            const href = linkEl.attr("href");
            if (!href || !href.includes("/ani/")) continue;
            const fullLink = this.absolute(base, href);
            if (seen.has(fullLink)) continue;
            seen.add(fullLink);

            let name = titleEl && titleEl.node ? titleEl.text.trim() : "";
            if (!name) name = linkEl.attr("title") || "";
            name = name.replace(/<[^>]+>/g, "").trim();
            if (!name) continue;

            const imgEl = item.selectFirst(".img-wrapper") || item.selectFirst("img") || item.selectFirst("[data-original]");
            let img = "";
            if (imgEl && imgEl.node) {
              img = imgEl.attr("data-original") || imgEl.attr("data-src") || imgEl.attr("src") || "";
            }
            if (!img) {
              const bgMatch = (item.outerHtml || "").match(/url\(['"]?([^'")]+)['"]?\)/i);
              if (bgMatch) img = bgMatch[1];
            }

            cards.push({
              name: name,
              link: fullLink,
              imageUrl: this._coverImageUrl(base, img)
            });
          }
        }
      } catch (_) {}
    }

    // Regex fallback if Document parser returned 0 cards
    if (!cards.length) {
      const vodItemRegex = /<div[^>]*class=["'][^"']*vod-item[^"']*["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
      const matches = docText.match(vodItemRegex) || [];
      for (const block of matches) {
        const linkMatch = block.match(/href=["'](\/ani\/\d+\/?)["']/i);
        if (!linkMatch) continue;
        const fullLink = this.absolute(base, linkMatch[1]);
        if (seen.has(fullLink)) continue;
        seen.add(fullLink);

        const titleMatch = block.match(/<h3[^>]*class=["'][^"']*vod-item-title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
        const name = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        if (!name) continue;

        const imgMatch = block.match(/(?:data-original|src)=["']([^"']+)["']/i) || block.match(/url\(['"]?([^'")]+)['"]?\)/i);
        const img = imgMatch ? imgMatch[1] : "";

        cards.push({
          name: name,
          link: fullLink,
          imageUrl: this._coverImageUrl(base, img)
        });
      }
    }

    return cards;
  }

  _hasNextPage(html, currentPage) {
    const text = this._text(html);
    const nextPage = currentPage + 1;
    if (text.includes("page/" + nextPage + "/") || text.includes("&gt;") || text.includes("&rarr;") || text.includes("<span>&rarr;</span>")) {
      return true;
    }
    const pageMatches = [...text.matchAll(/page\/(\d+)\//gi)].map(m => Number(m[1])).filter(Boolean);
    if (pageMatches.length && Math.max(...pageMatches) > currentPage) return true;
    return false;
  }

  // --- Catalog Methods ---
  async getPopular(page) {
    const base = await this._resolveBaseUrl();
    const pageNum = Math.max(1, Number(page) || 1);
    const url = pageNum === 1 ? base + "/label/topday/" : base + "/label/topday/page/" + pageNum + "/";
    try {
      const html = await this._requestText(url, base + "/", 15);
      const list = this._extractCards(html, base);
      await this._clearTransportFailure();
      return this._localizeResult({
        list: list,
        hasNextPage: this._hasNextPage(html, pageNum)
      });
    } catch (_) {
      await this._clearTransportFailure();
      return { list: [], hasNextPage: false };
    }
  }

  async getLatestUpdates(page) {
    const base = await this._resolveBaseUrl();
    const pageNum = Math.max(1, Number(page) || 1);
    const url = pageNum === 1 ? base + "/list/2/" : base + "/list/2/page/" + pageNum + "/";
    try {
      const html = await this._requestText(url, base + "/", 15);
      const list = this._extractCards(html, base);
      await this._clearTransportFailure();
      return this._localizeResult({
        list: list,
        hasNextPage: this._hasNextPage(html, pageNum)
      });
    } catch (_) {
      await this._clearTransportFailure();
      return { list: [], hasNextPage: false };
    }
  }

  async search(query, page, filters) {
    const base = await this._resolveBaseUrl();
    const pageNum = Math.max(1, Number(page) || 1);
    const q = this._text(query).trim();

    let url = "";
    if (q) {
      url = pageNum === 1 ? base + "/view/?wd=" + encodeURIComponent(q) : base + "/view/page/" + pageNum + "/?wd=" + encodeURIComponent(q);
    } else {
      const criteria = this._filterCriteria(filters);
      if (criteria.mode && criteria.mode.startsWith("top_")) {
        const topKind = criteria.mode.slice(4);
        url = pageNum === 1 ? base + "/label/" + topKind + "/" : base + "/label/" + topKind + "/page/" + pageNum + "/";
      } else {
        const mid = criteria.mode === "ani16" ? "9" : "2";
        const pathParts = ["list", mid];
        const classVal = criteria.weekday || criteria.genre;
        if (classVal) pathParts.push("class", encodeURIComponent(classVal));
        if (criteria.type) pathParts.push("lang", encodeURIComponent(criteria.type));
        if (criteria.year) pathParts.push("year", encodeURIComponent(criteria.year));
        if (pageNum > 1) pathParts.push("page", String(pageNum));
        url = base + "/" + pathParts.join("/") + "/";
      }
    }

    try {
      const html = await this._requestText(url, base + "/", 15);
      const list = this._extractCards(html, base);
      await this._clearTransportFailure();
      return this._localizeResult({
        list: list,
        hasNextPage: this._hasNextPage(html, pageNum)
      });
    } catch (_) {
      await this._clearTransportFailure();
      return { list: [], hasNextPage: false };
    }
  }

  // --- Detail ---
  async getDetail(url) {
    const base = await this._resolveBaseUrl();
    const targetUrl = this.absolute(base, url);
    const html = await this._requestText(targetUrl, base + "/", 15);

    // 1. Title
    let title = "";
    const titleMatch = html.match(/<h1[^>]*class=["'][^"']*detail-info-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*class=["'][^"']*linktv-h1[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    if (!title) {
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      if (ogTitle) title = ogTitle[1].replace(/다시보기.*$/, "").replace(/\|.*$/, "").trim();
    }
    if (!title) title = "작품 정보";

    // 2. Original Japanese title
    const origMatch = html.match(/원제[\s\S]{0,50}?<\/strong>\s*<\/span>\s*([^<]+)/i) || html.match(/원제[\s\S]{0,30}?[：:]\s*([^<]+)/i);
    const japaneseTitle = origMatch ? origMatch[1].trim() : "";

    // 3. Cover Image
    let imageUrl = "";
    const imgMatch = html.match(/<div[^>]*class=["'][^"']*detail-img[^"']*["'][\s\S]*?(?:data-original|src)=["']([^"']+)["']/i);
    if (imgMatch && !imgMatch[1].includes("loading.gif")) imageUrl = imgMatch[1];
    if (!imageUrl) {
      const ogImg = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      if (ogImg) imageUrl = ogImg[1];
    }
    const cover = this._coverImageUrl(base, imageUrl);

    // 4. Genres & Studio
    const genres = [...html.matchAll(/<a[^>]*href=["'][^"']*\/class\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
    const uniqueGenres = [...new Set(genres)];

    const studioMatch = html.match(/제작사[\s\S]{0,30}?<a[^>]*>([\s\S]*?)<\/a>/i);
    const studio = studioMatch ? studioMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // 5. Description
    let description = "";
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) description = descMatch[1].replace(/다시보기.*$/, "").trim();

    // 6. Episodes & Chapters
    const epMatches = [...html.matchAll(/<li[^>]*class=["'][^"']*episodelist[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    let episodes = [];
    const seenEp = new Set();

    for (const match of epMatches) {
      const epHref = match[1].trim();
      const rawName = match[2].replace(/<[^>]+>/g, "").trim();
      const fullEpUrl = this.absolute(base, epHref);
      if (seenEp.has(fullEpUrl)) continue;
      seenEp.add(fullEpUrl);

      const numMatch = epHref.match(/\/k(\d+)\/?/i) || rawName.match(/(\d+)/);
      const epNum = numMatch ? numMatch[1] : String(episodes.length + 1);

      let epTitle = rawName;
      if (!epTitle || epTitle === epNum) {
        epTitle = epNum + "화";
      } else if (!epTitle.includes("화") && !epTitle.includes(epNum)) {
        epTitle = epNum + "화 . " + epTitle;
      }

      episodes.push({
        num: Number(epNum) || 0,
        name: epTitle,
        url: fullEpUrl,
        dateUpload: "",
        scanlator: "",
        isFiller: false
      });
    }

    // Sort episodes ascending (1화 -> N화)
    if (episodes.length > 1) {
      episodes.sort((a, b) => a.num - b.num);
    }
    const cleanEpisodes = episodes.map(e => ({
      name: e.name,
      url: e.url,
      dateUpload: e.dateUpload,
      scanlator: e.scanlator,
      isFiller: false
    }));

    // Status: 1 if finished, 0 if ongoing
    const isFinished = html.includes("완결") || html.includes("status-finished");
    const detailLang = await this._freshDetailTitleLanguage();
    const finalTitle = detailLang === "ja" && japaneseTitle ? japaneseTitle : title;

    await this._clearTransportFailure();
    return {
      name: finalTitle,
      link: targetUrl,
      imageUrl: cover,
      description: description,
      author: studio,
      artist: "",
      genre: uniqueGenres,
      status: isFinished ? 1 : 0,
      episodes: cleanEpisodes,
      chapters: cleanEpisodes
    };
  }

  // --- Video List ---
  async getVideoList(url) {
    try {
      const base = await this._resolveBaseUrl();
      const targetUrl = this.absolute(base, url);
      const html = await this._requestText(targetUrl, base + "/", 15);

      let rawStreamUrl = "";
      let subtitleUrl = "";

      // 1. Try parsing player_aaaa
      const playerMatch = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\});/);
      if (playerMatch) {
        try {
          const p = JSON.parse(playerMatch[1]);
          let streamCandidate = p.url || p.actual_url || "";
          if (p.encrypt === 1 && typeof unescape === "function") {
            streamCandidate = unescape(streamCandidate);
          } else if (p.encrypt === 2 && typeof atob === "function") {
            streamCandidate = atob(streamCandidate);
          }
          if (streamCandidate && /^https?:\/\//i.test(streamCandidate)) {
            rawStreamUrl = streamCandidate;
          }
          if (p.subtitle_url && /^https?:\/\//i.test(p.subtitle_url)) {
            subtitleUrl = p.subtitle_url;
          }
        } catch (_) {}
      }

      // 2. Try server switch buttons
      const serverUrls = [];
      const serverMatches = [...html.matchAll(/data-url=["']([^"']+\.m3u8[^"']*)["']/gi)];
      for (const sm of serverMatches) {
        if (sm[1] && /^https?:\/\//i.test(sm[1])) {
          serverUrls.push(sm[1]);
        }
      }
      if (!rawStreamUrl && serverUrls.length) {
        rawStreamUrl = serverUrls[0];
      }

      // 3. General regex for m3u8
      if (!rawStreamUrl) {
        const m3u8Match = html.match(/https?:\/\/[^"'\s\\]+\.m3u8(?:\?[^"'\s\\]*)?/i);
        if (m3u8Match) rawStreamUrl = m3u8Match[0].replace(/\\u0026/g, "&");
      }

      if (!rawStreamUrl) {
        await this._clearTransportFailure();
        return [];
      }

      const streamHeaders = {
        "User-Agent": this.userAgent,
        "Referer": targetUrl,
        "Origin": this._origin(targetUrl)
      };

      const subtitles = this._siteSubtitlesDisabled() ? [] : (subtitleUrl ? [{ file: subtitleUrl, label: "사이트 자막" }] : []);
      const videos = [];

      // Try expanding HLS playlist
      const expanded = await this._expandHls(rawStreamUrl, targetUrl, "자동 (HLS)");
      for (const item of expanded) {
        videos.push({
          url: item.url,
          originalUrl: item.url,
          quality: item.quality,
          headers: streamHeaders,
          subtitles: subtitles,
          audios: []
        });
      }

      await this._clearTransportFailure();
      return videos;
    } catch (_) {
      await this._clearTransportFailure();
      return [];
    }
  }

  async _expandHls(stream, pageUrl, defaultQuality) {
    try {
      const manifest = await this._requestText(stream, pageUrl, 10);
      const lines = this._text(manifest).split(/\r?\n/);
      const variants = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.indexOf("#EXT-X-STREAM-INF:") !== 0) continue;
        let child = "";
        for (let next = i + 1; next < lines.length; next++) {
          const candidate = lines[next].trim();
          if (candidate && !candidate.startsWith("#")) {
            child = candidate;
            break;
          }
        }
        if (!child) continue;
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        const height = resMatch ? resMatch[1] : "";
        const bw = bwMatch ? Number(bwMatch[1]) : 0;
        const label = height ? height + "p" : bw > 0 ? Math.round(bw / 1000) + "kbps" : defaultQuality;
        const childUrl = this.absolute(stream, child);
        variants.push({ url: childUrl, quality: label });
      }
      if (variants.length) {
        variants.unshift({ url: stream, quality: "자동 (HLS)" });
        return variants;
      }
    } catch (_) {}
    return [{ url: stream, quality: defaultQuality || "자동 (HLS)" }];
  }

  // --- Title Localization ---
  _titleBridgeKey(value) {
    let text = this._text(value);
    try { text = text.normalize("NFKC"); } catch (_) {}
    return text.toLowerCase().replace(/[^a-z0-9가-힣ぁ-んァ-ヶ一-龯]+/g, "");
  }

  async _localizedTitle(name) {
    const lang = this._titleLanguage();
    if (lang === "ko") return name;
    const original = this._text(name).trim();
    if (!original) return "";

    const key = this.titleCachePrefix + this._titleBridgeKey(original);
    const cached = this._memCache.get(key);
    if (cached) return cached;

    // Check Anissia
    try {
      const clean = original.replace(/\s*[\(\[]?\d{4}[\)\]]?\s*$/g, "").replace(/\s*[\(\[](더빙|자막|무삭제)[\)\]]\s*$/g, "").trim();
      const res = await this._clientGet("https://api.anissia.net/anime/list/0?q=" + encodeURIComponent(clean), { Accept: "application/json", Referer: "https://anissia.net/anime" }, 6);
      if (res && res.statusCode >= 200 && res.statusCode < 300) {
        const payload = JSON.parse(this._text(res.body));
        const items = payload && payload.data && Array.isArray(payload.data.content) ? payload.data.content : [];
        const wanted = this._titleBridgeKey(clean);
        const match = items.find(it => this._titleBridgeKey(it && it.subject) === wanted);
        if (match && match.originalSubject) {
          const ja = String(match.originalSubject).trim();
          this._memCache.set(key, ja);
          return ja;
        }
      }
    } catch (_) {}

    return original;
  }

  async _localizeResult(result) {
    if (!result || !Array.isArray(result.list) || this._titleLanguage() === "ko") return result;
    const items = result.list;
    const workers = [];
    let cursor = 0;
    const work = async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        const item = items[index];
        if (!item || !item.name) continue;
        item.name = await this._localizedTitle(item.name);
      }
    };
    for (let i = 0; i < Math.min(4, items.length); i++) workers.push(work());
    await Promise.all(workers);
    return result;
  }

  // --- Filter Definitions ---
  get modeOptions() {
    return [
      ["Anime (일반)", "anime"],
      ["Ani16+ (16세 이상)", "ani16"],
      ["TOP 일간", "top_topday"],
      ["TOP 주간", "top_week"],
      ["TOP 월간", "top_month"],
      ["TOP 전체", "top_view"]
    ];
  }
  get dayOptions() {
    return [
      ["전체", ""],
      ["월요일", "월"],
      ["화요일", "화"],
      ["수요일", "수"],
      ["목요일", "목"],
      ["금요일", "금"],
      ["토요일", "토"],
      ["일요일", "일"]
    ];
  }
  get genreOptions() {
    return [
      ["Action", "Action"], ["Webtoon", "Webtoon"], ["Mystery", "Mystery"],
      ["Romance", "Romance"], ["Sci-Fi", "Sci-Fi"], ["Slice of Life", "Slice of Life"],
      ["Sports", "Sports"], ["Adventure", "Adventure"], ["Avant Garde", "Avant Garde"],
      ["Boys Love", "Boys Love"], ["Comedy", "Comedy"], ["Drama", "Drama"],
      ["Fantasy", "Fantasy"], ["Girls Love", "Girls Love"], ["Gourmet", "Gourmet"],
      ["Horror", "Horror"], ["Supernatural", "Supernatural"], ["Suspense", "Suspense"],
      ["Seinen", "Seinen"], ["Shoujo", "Shoujo"], ["Shounen", "Shounen"],
      ["Military", "Military"], ["Music", "Music"], ["School", "School"],
      ["CN Animation", "CN Animation"]
    ];
  }
  get typeOptions() {
    return [["전체", ""], ["TV", "TV"], ["Movie", "Movie"], ["OVA", "OVA"]];
  }
  get yearOptions() {
    const list = [["전체", ""]];
    for (let y = 2026; y >= 1990; y--) list.push([String(y) + "년", String(y)]);
    return list;
  }

  _option(name, value) { return { type_name: "SelectOption", name, value }; }
  _select(type, name, pairs) {
    const values = pairs.map(p => this._option(p[0], p[1]));
    return { type, name, type_name: "SelectFilter", values };
  }
  _filterValue(filters, type, fallback) {
    if (!Array.isArray(filters)) return fallback;
    for (const f of filters) {
      if (!f || f.type !== type || !Array.isArray(f.values)) continue;
      const opt = f.values[Number(f.state) || 0];
      if (!opt || opt.value === undefined) return fallback;
      return this._text(opt.value);
    }
    return fallback;
  }
  _filterCriteria(filters) {
    return {
      mode: this._filterValue(filters, "mode", "anime"),
      weekday: this._filterValue(filters, "weekday", ""),
      genre: this._filterValue(filters, "genre", ""),
      type: this._filterValue(filters, "type", ""),
      year: this._filterValue(filters, "year", "")
    };
  }

  getFilterList() {
    return [
      this._select("mode", "목록 구분", this.modeOptions),
      this._select("weekday", "방영 요일", this.dayOptions),
      this._select("genre", "장르", [["전체", ""]].concat(this.genreOptions)),
      this._select("type", "작품 형식", this.typeOptions),
      this._select("year", "방영 연도", this.yearOptions)
    ];
  }

  getSourcePreferences() {
    return [
      {
        key: "linkani_title_language_v2",
        listPreference: {
          title: "작품 제목 언어",
          summary: "한국어와 일본어 중에서 선택합니다. 변경 후 현재 화면을 새로고침하세요.",
          valueIndex: 0,
          entries: ["한국어", "일본어"],
          entryValues: ["ko", "ja"]
        }
      },
      {
        key: "linkani_domain_url",
        editTextPreference: {
          title: "링크애니 주소 직접 지정 (선택)",
          summary: "기본값은 https://linkani.tv 입니다. 접속 주소가 변경되었을 때 입력하세요.",
          value: "",
          dialogTitle: "링크애니 주소",
          dialogMessage: "https://로 시작하는 주소를 입력하세요. 기본 주소를 사용하려면 비워 두세요."
        }
      },
      {
        key: "linkani_disable_site_subtitles",
        switchPreferenceCompat: {
          title: "사이트 자막 끄기",
          summary: "기본은 꺼짐. 켜면 사이트가 제공하는 외부 자막을 플레이어에 전달하지 않습니다.",
          value: false
        }
      }
    ];
  }

  async getPageList() { return []; }
  async getHtmlContent() { return ""; }
  async cleanHtmlContent(html) { return html; }
}
