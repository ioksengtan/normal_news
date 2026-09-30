import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { PUBLISHED_DATA_FILES } from './constants.js';

const API_ROOT = 'https://api.github.com';

export function resolveToken() {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (token) return token;
  } catch {
    // 下面統一報缺少 token。
  }
  throw new Error('找不到 GitHub token。請設定 GITHUB_TOKEN，或先以 repo 擁有者身分執行 gh auth login。');
}

export function resolveRepo(explicit) {
  if (explicit) return assertRepo(explicit);
  if (process.env.GITHUB_REPOSITORY) return assertRepo(process.env.GITHUB_REPOSITORY);
  try {
    const name = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (name) return assertRepo(name);
  } catch {
    // 下面統一報無法判斷 repo。
  }
  throw new Error('無法判斷 repo。請傳 --repo owner/name，或設定 GITHUB_REPOSITORY。');
}

function assertRepo(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`repo 格式不正確：${value}`);
  }
  return value;
}

export function readPublishFiles(dataDir) {
  return PUBLISHED_DATA_FILES.map((name) => {
    const localPath = path.join(dataDir, name);
    if (!fs.existsSync(localPath)) {
      throw new Error(`找不到要發布的檔案：${localPath}`);
    }
    return {
      path: `data/${name}`,
      content: fs.readFileSync(localPath, 'utf8'),
    };
  });
}

export async function githubRequest(token, route, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  const res = await fetch(`${API_ROOT}${route}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'normal-news-bot',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = data && typeof data === 'object' && data.message ? data.message : text;
    throw new Error(`GitHub API ${method} ${route} 失敗：HTTP ${res.status} ${detail}`.trim());
  }
  return data;
}

export async function publishDataFiles({
  token,
  repo,
  branch = 'main',
  message = 'chore: 更新新聞處理資料',
  files,
  dryRun = false,
  request = githubRequest,
}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('沒有要發布的檔案');
  }
  const paths = files.map((file) => file.path);
  const expected = PUBLISHED_DATA_FILES.map((name) => `data/${name}`);
  const head = paths.slice(0, expected.length);
  const extras = paths.slice(expected.length);
  const extraOk = extras.every((item) => /^data\/international\/events\/evt_[A-Za-z0-9_-]+\.json$/.test(item));
  if (head.length !== expected.length || expected.some((item, index) => item !== head[index]) || !extraOk) {
    throw new Error(`只能一次提交這 ${expected.length} 個資料檔，另可加 data/international/events/ 的單篇全文：${expected.join('、')}`);
  }

  const getRefRoute = `/repos/${repo}/git/ref/heads/${branch}`;
  const updateRefRoute = `/repos/${repo}/git/refs/heads/${branch}`;
  const ref = await request(token, getRefRoute);
  const parentSha = ref?.object?.sha;
  if (!parentSha) throw new Error(`讀不到 ${branch} 的 commit sha`);

  const parent = await request(token, `/repos/${repo}/git/commits/${parentSha}`);
  const baseTree = parent?.tree?.sha;
  if (!baseTree) throw new Error('讀不到目前的 tree sha');

  const treeList = await request(token, `/repos/${repo}/git/trees/${baseTree}?recursive=1`);
  if (treeList?.truncated) {
    throw new Error('遠端 git tree 被截斷，無法確認檔案是否變更');
  }
  const remoteByPath = new Map((treeList.tree || []).filter((item) => item.type === 'blob').map((item) => [item.path, item.sha]));

  const changed = [];
  for (const file of files) {
    const remoteSha = remoteByPath.get(file.path);
    if (!remoteSha) {
      changed.push(file.path);
      continue;
    }
    const blob = await request(token, `/repos/${repo}/git/blobs/${remoteSha}`);
    const remoteText = decodeBlob(blob?.content);
    if (remoteText !== file.content) changed.push(file.path);
  }

  if (changed.length === 0) {
    return { changed: false, dryRun, commitSha: parentSha, branch, files: [] };
  }
  if (dryRun) {
    return { changed: true, dryRun: true, commitSha: null, branch, files: changed, parentSha };
  }

  const tree = await request(token, `/repos/${repo}/git/trees`, {
    method: 'POST',
    body: {
      base_tree: baseTree,
      tree: files.map((file) => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content,
      })),
    },
  });
  if (!tree?.sha) throw new Error('建立 tree 失敗');
  if (tree.sha === baseTree) {
    return { changed: false, dryRun: false, commitSha: parentSha, branch, files: [] };
  }

  const commit = await request(token, `/repos/${repo}/git/commits`, {
    method: 'POST',
    body: {
      message,
      tree: tree.sha,
      parents: [parentSha],
    },
  });
  if (!commit?.sha) throw new Error('建立 commit 失敗');

  const updated = await request(token, updateRefRoute, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  if (updated?.object?.sha !== commit.sha) {
    throw new Error('更新分支失敗：回傳的 sha 與新 commit 不同');
  }

  return { changed: true, dryRun: false, commitSha: commit.sha, branch, files: changed, parentSha };
}

function decodeBlob(content) {
  if (typeof content !== 'string') return '';
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
}
