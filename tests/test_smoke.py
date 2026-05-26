# 16:1 0:0 0:0
# tests/test_smoke.py
import json, subprocess, sys, os

REQ = {
  "task_id": "smoke1",
  "input": {"text": "hello a0", "files": [], "metadata": {}},
  "tools_allowed": ["none"],
  "mode": "analyze",
  "hmmm": ["hmm"]
}

def main():
    p = subprocess.run([sys.executable, "-m", "a0.a0"], input=json.dumps(REQ).encode("utf-8"), stdout=subprocess.PIPE, check=True)
    out = json.loads(p.stdout.decode("utf-8"))
    assert out["task_id"] == "smoke1"
    assert "result" in out
    print("OK")

if __name__ == "__main__":
    main()
# 16:1 0:0 0:0
