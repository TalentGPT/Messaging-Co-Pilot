const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(__dirname, 'bin');
const CLOUDFLARED_PATH = path.join(BIN_DIR, 'cloudflared.exe');
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'linkedin-outreach-local' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function ensureCloudflared() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }
  if (fs.existsSync(CLOUDFLARED_PATH)) {
    console.log('[tunnel] cloudflared.exe found');
    return;
  }
  console.log('[tunnel] Downloading cloudflared for Windows...');
  await download(DOWNLOAD_URL, CLOUDFLARED_PATH);
  console.log('[tunnel] Download complete');
}

function startTunnel(port) {
  return new Promise(async (resolve, reject) => {
    try {
      await ensureCloudflared();
    } catch (err) {
      return reject(new Error(`Failed to get cloudflared: ${err.message}`));
    }

    const exe = process.platform === 'win32' ? CLOUDFLARED_PATH : 'cloudflared';
    const args = ['tunnel', '--url', `http://localhost:${port}`];
    console.log(`[tunnel] Starting: ${exe} ${args.join(' ')}`);

    const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let tunnelUrl = null;
    let resolved = false;

    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

    function parseLine(line) {
      const match = line.match(urlRegex);
      if (match && !resolved) {
        tunnelUrl = match[0];
        resolved = true;
        console.log(`[tunnel] Public URL: ${tunnelUrl}`);
        console.log('');
        console.log('==========================================');
        console.log('  TUNNEL ACTIVE');
        console.log(`  URL: ${tunnelUrl}`);
        console.log('');
        console.log('  Update your Replit app BRIDGE_URL to:');
        console.log(`  ${tunnelUrl}`);
        console.log('==========================================');
        console.log('');
        resolve({ url: tunnelUrl, process: child });
      }
    }

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(parseLine);
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line) => {
        if (line.trim()) console.log(`[tunnel] ${line.trim()}`);
        parseLine(line);
      });
    });

    child.on('error', (err) => {
      if (!resolved) reject(err);
    });

    child.on('exit', (code) => {
      if (!resolved) {
        reject(new Error(`cloudflared exited with code ${code} before tunnel was established`));
      }
    });

    setTimeout(() => {
      if (!resolved) {
        child.kill();
        reject(new Error('Tunnel setup timed out after 30 seconds'));
      }
    }, 30000);
  });
}

module.exports = { startTunnel, ensureCloudflared };
