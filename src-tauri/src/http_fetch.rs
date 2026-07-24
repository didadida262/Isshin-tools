use reqwest::header::{ACCEPT, HeaderMap, HeaderValue, REFERER, USER_AGENT};
use std::time::Duration;

const USER_AGENT_VALUE: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const ALLOWED_HOSTS: &[&str] = &[
    "fred.stlouisfed.org",
    "api.stlouisfed.org",
    "api.gold-api.com",
    "open.er-api.com",
    "api.allorigins.win",
    "home.treasury.gov",
    "hq.sinajs.cn",
    "push2.eastmoney.com",
    "push2delay.eastmoney.com",
    "www.gold.org",
    "gold.org",
    "tradingeconomics.com",
    "www.tradingeconomics.com",
];

fn host_allowed(host: &str) -> bool {
    ALLOWED_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
}

fn extract_host(url: &str) -> Result<String, String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .ok_or_else(|| "仅允许 http/https".to_string())?;
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .split('@')
        .next_back()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .trim();
    if host.is_empty() {
        return Err("无效 URL host".into());
    }
    Ok(host.to_string())
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(15))
        .pool_max_idle_per_host(0)
        .build()
        .map_err(|e| format!("http client: {e}"))
}

/// Desktop-side GET for macro data sources that reject webview/plugin HTTP/2.
#[tauri::command]
pub async fn http_get_text(url: String) -> Result<String, String> {
    let host = extract_host(&url)?;
    if !host_allowed(&host) {
        return Err(format!("host 未授权: {host}"));
    }

    let client = build_client()?;
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/csv,application/xml,application/json,text/plain,*/*"),
    );
    if host.contains("sinajs") {
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://finance.sina.com.cn"),
        );
    }
    if host.contains("eastmoney") {
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://quote.eastmoney.com/"),
        );
    }

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    if !status.is_success() {
        let snippet: String = body.chars().take(120).collect();
        return Err(format!("HTTP {status} · {snippet}"));
    }

    // HTML pages scraped intentionally (WGC articles, Trading Economics tables).
    let allow_html = host.eq_ignore_ascii_case("www.gold.org")
        || host.eq_ignore_ascii_case("gold.org")
        || host.eq_ignore_ascii_case("tradingeconomics.com")
        || host.eq_ignore_ascii_case("www.tradingeconomics.com");
    if !allow_html
        && (body.trim_start().starts_with("<!DOCTYPE") || body.trim_start().starts_with("<html"))
    {
        return Err("上游返回 HTML（可能被拦截），非预期数据".into());
    }

    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_expected_hosts() {
        assert!(host_allowed("home.treasury.gov"));
        assert!(host_allowed("hq.sinajs.cn"));
        assert!(!host_allowed("evil.com"));
    }

    #[tokio::test]
    async fn fetches_treasury_nominal_10y() {
        let body = http_get_text(
            "https://home.treasury.gov/sites/default/files/interest-rates/yield.xml".into(),
        )
        .await
        .expect("treasury yield.xml");
        assert!(body.contains("BC_10YEAR"), "missing BC_10YEAR");
    }
}
