// 根据接口信息动态生成 Java / Python / Nodejs 调用示例
const BASE = 'https://api.example.com';

function buildPath(api) {
  // 路径已在 apiData 中写为 {param} 格式，直接返回
  return api.path;
}

function getQueryParams(api) {
  return (api.params || []).filter((p) => !p.path);
}

function getPathParams(api) {
  return (api.params || []).filter((p) => p.path);
}

function buildQueryString(params) {
  return params
    .filter((p) => p.required)
    .map((p) => `${p.name}=<${p.name}>`)
    .join('&');
}

function buildBody(params) {
  const obj = {};
  params.forEach((p) => {
    if (p.required) {
      obj[p.name] =
        p.type === 'int' ? 0 :
        p.type === 'bool' ? true :
        p.type === 'float' ? 0.0 :
        p.type === 'array' ? [{ role: 'user', content: '你好' }] :
        p.type.includes('|') ? '<text>' :
        `<${p.name}>`;
    }
  });
  return JSON.stringify(obj, null, 2);
}

export function genJava(api) {
  const method = api.method.toUpperCase();
  const path = buildPath(api);
  const url = `${BASE}${path}`;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const queryParams = getQueryParams(api);
  const qs = buildQueryString(queryParams);
  const fullUrl = qs ? `${url}?${qs}` : url;

  let headerLines = '            .header("Content-Type", "application/json")\n            .header("Authorization", "Bearer sk-<API_KEY>")';

  let methodCall = '';
  if (hasBody && api.params.length > 0) {
    const body = buildBody(getQueryParams(api));
    const bodyEscaped = JSON.stringify(body);
    methodCall = `.${method.toLowerCase()}(HttpRequest.BodyPublishers.ofString(${bodyEscaped}))`;
  } else {
    methodCall = `.${method}()`;
  }

  return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class ApiExample {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${fullUrl}"))
${headerLines}
            ${methodCall}
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.statusCode());
        System.out.println(response.body());
    }
}`;
}

export function genPython(api) {
  const method = api.method.toLowerCase();
  const path = buildPath(api);
  const url = `${BASE}${path}`;
  const hasBody = ['post', 'put', 'patch'].includes(method);
  const queryParams = getQueryParams(api);

  const headers = `headers = {\n    "Authorization": "Bearer sk-<API_KEY>"\n}`;

  let extraLines = '';
  let callArgs = 'headers=headers';
  if (!hasBody && queryParams.length > 0) {
    const obj = {};
    queryParams.forEach((p) => { if (p.required) obj[p.name] = `<${p.name}>`; });
    extraLines = `\nparams = ${JSON.stringify(obj, null, 4)}`;
    callArgs = 'params=params, headers=headers';
  }
  if (hasBody && queryParams.length > 0) {
    const body = buildBody(queryParams);
    extraLines = `\njson_data = ${body}`;
    callArgs = 'json=json_data, headers=headers';
  }

  return `import requests

${headers}${extraLines}

response = requests.${method}("${url}", ${callArgs})
print(response.status_code)
print(response.json())`;
}

export function genNodejs(api) {
  const method = api.method.toUpperCase();
  const path = buildPath(api);
  const url = `${BASE}${path}`;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const queryParams = getQueryParams(api);

  let fetchArgs = `{\n  method: "${method}",\n  headers: {\n    "Authorization": "Bearer sk-<API_KEY>"\n  }`;
  if (hasBody && queryParams.length > 0) {
    const body = buildBody(queryParams);
    fetchArgs += `,\n  body: JSON.stringify(${body})`;
  }
  fetchArgs += '\n}';

  let urlLine = `"${url}"`;
  if (!hasBody && queryParams.length > 0) {
    const qs = buildQueryString(queryParams);
    if (qs) urlLine = `"${url}?${qs}"`;
  }

  return `const response = await fetch(${urlLine}, ${fetchArgs});
const data = await response.json();
console.log(response.status, data);`;
}

export function genCurl(api) {
  const method = api.method.toUpperCase();
  const path = buildPath(api);
  const url = `${BASE}${path}`;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const queryParams = getQueryParams(api);

  let urlLine = url;
  if (!hasBody && queryParams.length > 0) {
    const qs = buildQueryString(queryParams);
    if (qs) urlLine = `${url}?${qs}`;
  }

  const lines = [`curl -X ${method} "${urlLine}"`];
  if (hasBody) {
    lines.push('  -H "Content-Type: application/json"');
  }
  lines.push('  -H "Authorization: Bearer sk-<API_KEY>"');
  if (hasBody && queryParams.length > 0) {
    const body = buildBody(queryParams);
    lines.push(`  -d '${body}'`);
  }
  return lines.join(' \\\n');
}
