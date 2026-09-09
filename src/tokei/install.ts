import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import { getExecOutput } from "@actions/exec";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";

const RELEASES = "https://github.com/XAMPPRocky/tokei/releases/download";
const TOOL_NAME = "tokei";

export class TokeiInstallError extends Error {
  override name = "TokeiInstallError";
}

/**
 * Locate a tokei binary: either the one on PATH (`version === "system"`) or a
 * pinned release downloaded from GitHub and kept in the runner tool cache.
 */
export async function resolveTokei(version: string): Promise<string> {
  if (version === "system") {
    const found = await io.which(TOOL_NAME, false);
    if (!found) {
      throw new TokeiInstallError(
        'tokei-version is "system" but no `tokei` binary was found on PATH. ' +
          "Install it first (e.g. `cargo install tokei`) or pin a version instead.",
      );
    }
    core.info(`Using tokei from PATH: ${found}`);
    return found;
  }

  const arch = os.arch();
  const cached = tc.find(TOOL_NAME, version, arch);
  if (cached) {
    core.info(`Using cached tokei ${version} from ${cached}`);
    return path.join(cached, binaryName());
  }

  const asset = assetFor(process.platform, arch);
  const url = `${RELEASES}/v${version}/${asset}`;
  core.info(`Downloading tokei ${version} from ${url}`);

  let downloaded: string;
  try {
    downloaded = await tc.downloadTool(url);
  } catch (error) {
    throw new TokeiInstallError(
      `Failed to download tokei ${version} (${url}): ${describe(error)}\n` +
        "Note: only tokei 12.x publishes prebuilt binaries on GitHub Releases. For newer " +
        "versions install tokei yourself (e.g. `cargo install tokei`) and set `tokei-version: system`.",
    );
  }

  let toolDir: string;
  if (asset.endsWith(".tar.gz")) {
    const extracted = await tc.extractTar(downloaded);
    toolDir = await tc.cacheDir(extracted, TOOL_NAME, version, arch);
  } else {
    toolDir = await tc.cacheFile(downloaded, binaryName(), TOOL_NAME, version, arch);
  }

  const binary = path.join(toolDir, binaryName());
  core.info(`Installed tokei ${version} to ${binary}`);
  return binary;
}

/** Run `tokei --version` and return the reported version string. */
export async function tokeiVersion(binary: string): Promise<string> {
  const { exitCode, stdout, stderr } = await getExecOutput(binary, ["--version"], {
    silent: true,
    ignoreReturnCode: true,
  });
  if (exitCode !== 0) {
    throw new TokeiInstallError(`\`${binary} --version\` failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

/** Map the runner platform to a tokei release asset name. */
export function assetFor(platform: NodeJS.Platform, arch: string): string {
  switch (platform) {
    case "linux":
      if (arch === "x64") return "tokei-x86_64-unknown-linux-musl.tar.gz";
      if (arch === "arm64") return "tokei-aarch64-unknown-linux-gnu.tar.gz";
      if (arch === "arm") return "tokei-armv7-unknown-linux-gnueabihf.tar.gz";
      break;
    case "darwin":
      // Apple Silicon runners execute the x86_64 build through Rosetta.
      if (arch === "x64" || arch === "arm64") return "tokei-x86_64-apple-darwin.tar.gz";
      break;
    case "win32":
      if (arch === "x64") return "tokei-x86_64-pc-windows-msvc.exe";
      if (arch === "ia32") return "tokei-i686-pc-windows-msvc.exe";
      break;
    default:
      break;
  }
  throw new TokeiInstallError(
    `No prebuilt tokei binary for ${platform}/${arch}. ` +
      "Install tokei yourself and set `tokei-version: system`.",
  );
}

function binaryName(): string {
  return process.platform === "win32" ? "tokei.exe" : "tokei";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
