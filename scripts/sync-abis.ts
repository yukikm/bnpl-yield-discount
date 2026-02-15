import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type FoundryArtifact = {
  abi: unknown;
};

const CONTRACTS = [
  { file: "LendingPool.sol", name: "LendingPool" },
  { file: "LoanManager.sol", name: "LoanManager" },
  { file: "CollateralVault.sol", name: "CollateralVault" },
  { file: "DiscountVault.sol", name: "DiscountVault" },
] as const;

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const outDir = path.join(repoRoot, "contracts", "out");
  const destDir = path.join(repoRoot, "packages", "shared", "src", "abi");

  await mkdir(destDir, { recursive: true });

  for (const c of CONTRACTS) {
    const artifactPath = path.join(outDir, c.file, `${c.name}.json`);
    const raw = await readFile(artifactPath, "utf8").catch(() => {
      throw new Error(
        `Missing artifact: ${artifactPath}. Run "pnpm contracts:build" first.`,
      );
    });

    const parsed = JSON.parse(raw) as FoundryArtifact;
    if (!parsed.abi) {
      throw new Error(`Invalid artifact (missing abi): ${artifactPath}`);
    }

    const outPath = path.join(destDir, `${c.name}.json`);
    await writeFile(outPath, JSON.stringify(parsed.abi, null, 2) + "\n", "utf8");
    // eslint-disable-next-line no-console
    console.log(`synced: ${path.relative(repoRoot, outPath)}`);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

