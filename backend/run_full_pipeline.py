import sys
import os
import time

sys.path.append(os.path.dirname(__file__))
from cv_engine import engine

def main():
    print("=== Processing cashier_store (140.14s full duration) ===")
    t0 = time.time()
    res1 = engine.run_pipeline("cashier_store", max_duration_sec=None)
    t1 = time.time()
    n_tracks1 = len(res1["tracks"])
    frames1 = res1["analytics"]["processed_frames"]
    dur1 = res1["analytics"]["duration_analyzed"]
    print(f"Cashier Store Done in {t1 - t0:.1f}s: {n_tracks1} customer tracks across {frames1} frames ({dur1}s)")

    print("\n=== Processing retail_store (111.05s full duration) ===")
    t0 = time.time()
    res2 = engine.run_pipeline("retail_store", max_duration_sec=None)
    t1 = time.time()
    n_tracks2 = len(res2["tracks"])
    frames2 = res2["analytics"]["processed_frames"]
    dur2 = res2["analytics"]["duration_analyzed"]
    print(f"Retail Store Done in {t1 - t0:.1f}s: {n_tracks2} customer tracks across {frames2} frames ({dur2}s)")

if __name__ == "__main__":
    main()
