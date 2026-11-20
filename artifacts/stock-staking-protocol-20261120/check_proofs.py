"""Check the Stock qualification proofs with Lean 4.30 and its standard library."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    root = Path(__file__).resolve().parent
    # StockTick imports StockRows and StockMotion. Compile them in that order.
    sources = [
        "PayoutArithmetic", "StockGadgets", "StockWinners",
        "StockRows", "StockMotion", "StockTick", "StockEncoding",
    ]
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        env = {**os.environ, "LEAN_PATH": str(work)}
        for name in sources:
            source = f"{name}.lean"
            shutil.copyfile(root / source, work / source)
            subprocess.run(
                ["lean", "-DwarningAsError=true", "-o", f"{name}.olean", source],
                cwd=work, env=env, check=True,
            )
            print(f"Checked {source}", flush=True)


if __name__ == "__main__":
    main()
