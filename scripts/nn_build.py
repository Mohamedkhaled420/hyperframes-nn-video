#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nn_build.py — single source of truth for every number that appears in the video.

Trains the real 35 -> 12 -> 10 network (5x7 pixel digits), records the full
training history + snapshots, and derives every per-scene data blob the 12
scenes display. Output: scripts/build/data.json

Everything is seeded => rebuilding produces byte-identical data.
"""
import json, math, os, random
import numpy as np

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build")
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------- digits ----
# Classic 5x7 dot-matrix bitmaps for 0..9
BITMAPS = [
    "01110 10001 10011 10101 11001 10001 01110",  # 0
    "00100 01100 00100 00100 00100 00100 01110",  # 1
    "01110 10001 00001 00010 00100 01000 11111",  # 2
    "11111 00010 00100 00010 00001 10001 01110",  # 3
    "00010 00110 01010 10010 11111 00010 00010",  # 4
    "11111 10000 11110 00001 00001 10001 01110",  # 5
    "00110 01000 10000 11110 10001 10001 01110",  # 6
    "11111 00001 00010 00100 01000 01000 01000",  # 7
    "01110 10001 10001 01110 10001 10001 01110",  # 8
    "01110 10001 10001 01111 00001 00010 01100",  # 9
]

def make_digits():
    """35 floats per digit; light neighbour softening so grids look anti-aliased."""
    DIG = []
    for b in BITMAPS:
        rows = b.split(" ")
        g = np.array([[float(ch) for ch in row] for row in rows])  # 7x5
        soft = g.copy()
        for r in range(7):
            for c in range(5):
                if g[r, c] == 0:
                    n = 0
                    for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
                        rr, cc = r+dr, c+dc
                        if 0 <= rr < 7 and 0 <= cc < 5 and g[rr, cc] == 1:
                            n += 1
                    if n:
                        soft[r, c] = 0.35
        DIG.append([round(float(v), 3) for v in soft.flatten()])
    return DIG

DIG = make_digits()

def noisy(d, seed, level):
    rng = np.random.RandomState(seed)
    v = np.clip(np.array(d) + rng.normal(0.0, level, 35), 0.0, 1.0)
    return [round(float(x), 3) for x in v]

# ---------------------------------------------------------------- dataset ---
def make_dataset():
    X, Y = [], []
    for d in range(10):
        for k in range(40):
            X.append(noisy(DIG[d], seed=700 + d * 100 + k, level=0.18))
            Y.append(d)
    return np.array(X), np.array(Y)

X, Y = make_dataset()
XT = np.array([noisy(DIG[d], seed=5000 + d, level=0.10) for d in range(10)])  # unseen test
YT = np.arange(10)

# ---------------------------------------------------------------- network ---
def rng_weights(shape, seed, scale):
    rs = np.random.RandomState(seed)
    return rs.normal(0.0, 1.0, shape) * scale

W1_0 = rng_weights((12, 35), 11, 0.5 / math.sqrt(35))
b1_0 = np.zeros(12)
W2_0 = rng_weights((10, 12), 12, 0.5 / math.sqrt(12))
b2_0 = np.zeros(10)
W1, b1, W2, b2 = W1_0.copy(), b1_0.copy(), W2_0.copy(), b2_0.copy()

def forward(W1, b1, W2, b2, X):
    Z1 = X @ W1.T + b1
    H = 1.0 / (1.0 + np.exp(-Z1))
    Z2 = H @ W2.T + b2
    Z2 = Z2 - Z2.max(axis=1, keepdims=True)
    E = np.exp(Z2)
    P = E / E.sum(axis=1, keepdims=True)
    return H, P

def train(epochs=300, lr=2.0):
    global W1, b1, W2, b2
    n = len(X)
    Yhot = np.eye(10)[Y]
    hist = {"loss": [], "tloss": [], "acc": [], "tacc": []}
    snaps = []
    snap_epochs = [1, 2, 4, 7, 11, 16, 22, 30, 40, 52, 66, 84, 110, 200, 300]
    for ep in range(1, epochs + 1):
        H, P = forward(W1, b1, W2, b2, X)
        # grads: cross-entropy + softmax
        D2 = (P - Yhot) / n                    # (n,10)
        gW2 = D2.T @ H                         # (10,12)
        gb2 = D2.sum(axis=0)
        D1 = (D2 @ W2) * H * (1.0 - H)         # (n,12)
        gW1 = D1.T @ X                         # (12,35)
        gb1 = D1.sum(axis=0)
        W2 -= lr * gW2; b2 -= lr * gb2
        W1 -= lr * gW1; b1 -= lr * gb1

        Ht, Pt = forward(W1, b1, W2, b2, XT)
        loss = float(-np.log(P[np.arange(n), Y] + 1e-12).mean())
        tloss = float(-np.log(Pt[np.arange(10), YT] + 1e-12).mean())
        acc = float((P.argmax(1) == Y).mean())
        tacc = float((Pt.argmax(1) == YT).mean())
        hist["loss"].append(round(loss, 4))
        hist["tloss"].append(round(tloss, 4))
        hist["acc"].append(round(acc, 4))
        hist["tacc"].append(round(tacc, 4))
        if ep in snap_epochs:
            snaps.append({
                "e": ep,
                "loss": round(loss, 4), "tloss": round(tloss, 4),
                "acc": round(acc, 4), "tacc": round(tacc, 4),
                "preds": [int(v) for v in Pt.argmax(1)],
            })
    return hist, snaps

hist, snaps = train()

trained_net = (W1, b1, W2, b2)
untrained_net = (W1_0, b1_0, W2_0, b2_0)

def probs_of(net, x):
    W1n, b1n, W2n, b2n = net
    _, P = forward(W1n, b1n, W2n, b2n, np.array([x]))
    return [round(float(v), 4) for v in P[0]]

# ---------------------------------------------------------------- derived ---
DIG3 = DIG[3]
p_untrained = probs_of(untrained_net, DIG3)
p_trained = probs_of(trained_net, DIG3)
l0 = -math.log(max(p_untrained[3], 1e-9))
l1 = -math.log(max(p_trained[3], 1e-9))
q0 = round(p_untrained[3] * 100)
q1 = round(p_trained[3] * 100)

# scene 6 walkthrough digits: clean 3, clean 7, clean 5, noisy 8
s6_inputs = [("3", DIG[3]), ("7", DIG[7]), ("5", DIG[5]), ("8", noisy(DIG[8], 908, 0.13))]
s6_states = []
for lab, x in s6_inputs:
    _, P = forward(W1, b1, W2, b2, np.array([x]))
    Z1 = np.array(x) @ W1.T + b1
    Hh = 1.0 / (1.0 + np.exp(-Z1))
    pr = int(P[0].argmax())
    s6_states.append({
        "label": lab, "grid": [round(float(v), 3) for v in x],
        "h": [round(float(v), 3) for v in Hh],
        "p": [round(float(v), 4) for v in P[0]],
        "pred": pr, "conf": round(float(P[0][pr]) * 100, 1),
    })

# scene 1: eight different sevens
sevens = [DIG[7],
          noisy(DIG[7], 71, 0.10), noisy(DIG[7], 72, 0.16), noisy(DIG[7], 73, 0.22),
          noisy(DIG[7], 74, 0.28),
          [round(float(v), 3) for v in np.roll(np.array(DIG[7]).reshape(7, 5), 1, axis=0).flatten()],
          [round(float(v), 3) for v in np.roll(np.array(DIG[7]).reshape(7, 5), -1, axis=1).flatten()],
          noisy(DIG[7], 76, 0.34)]

# scene 2: soft 28x28 version of the 3 (bilinear upsampling, contrast-stretched)
def soft28(d):
    g = np.array(d).reshape(7, 5)
    R = C = 28
    out = np.zeros((R, C))
    for r in range(R):
        for c in range(C):
            gy = r / (R - 1) * (7 - 1)
            gx = c / (C - 1) * (5 - 1)
            y0, x0 = int(gy), int(gx)
            y1, x1 = min(y0 + 1, 6), min(x0 + 1, 4)
            fy, fx = gy - y0, gx - x0
            v = (g[y0, x0] * (1 - fy) * (1 - fx) + g[y1, x0] * fy * (1 - fx) +
                 g[y0, x1] * (1 - fy) * fx + g[y1, x1] * fy * fx)
            out[r, c] = v
    lo, hi = out.min(), out.max()
    out = (out - lo) / max(hi - lo, 1e-9)
    return [round(float(v), 3) for v in out.flatten()]

# scene 11: random static test (600 seeded samples, keep most confident)
rs = random.Random(1234)
best = None
for k in range(600):
    xx = [min(1.0, max(0.0, rs.gauss(0.5, 0.42))) for _ in range(35)]
    p = probs_of(trained_net, xx)
    m = max(p)
    if best is None or m > best["m"]:
        best = {"m": m, "d": p.index(m), "grid": [round(v, 3) for v in xx], "p": p}
nd, np_ = best["d"], round(best["m"] * 100)

# scene 11: blend of a four and a nine
blend = [round((a + b) / 2, 3) for a, b in zip(DIG[4], DIG[9])]
pb = probs_of(trained_net, blend)
ordp = sorted(((v, i) for i, v in enumerate(pb)), reverse=True)
blend_top = [[i, round(v * 100)] for v, i in ordp[:3]]

# strongest first-layer weight (gold highlight in scene 5)
wi = np.unravel_index(np.abs(W1).argmax(), W1.shape)

# ---------------------------------------------------------------- display ---
disp = {
    "p3": round(s6_states[0]["conf"]),
    "q0": q0, "l0": f"{l0:.2f}", "l1": f"{l1:.2f}", "q1": q1,
    "acc": round(hist["acc"][-1] * 100), "tacc": round(hist["tacc"][-1] * 100),
    "acc0": round(hist["acc"][0] * 100),
    "nd": nd, "np": np_,
    "b0": blend_top[0], "b1": blend_top[1],
    "widx": [int(wi[0]), int(wi[1])],
    "wmax": round(float(np.abs(W1).max()), 3),
}

# ---------------------------------------------------------------- dump ------
data = {
    "dig": DIG,
    "sevens": sevens,
    "g28": soft28(DIG3),
    "s6": s6_states,
    "net": {
        "W1": [[round(float(v), 3) for v in row] for row in W1],
        "b1": [round(float(v), 3) for v in b1],
        "W2": [[round(float(v), 3) for v in row] for row in W2],
        "b2": [round(float(v), 3) for v in b2],
    },
    "net0": {
        "W1": [[round(float(v), 3) for v in row] for row in W1_0],
        "b1": [round(float(v), 3) for v in b1_0],
        "W2": [[round(float(v), 3) for v in row] for row in W2_0],
        "b2": [round(float(v), 3) for v in b2_0],
    },
    "hist": hist,
    "snaps": snaps,
    "test_digits": XT.tolist(),
    "static": {"grid": best["grid"], "p": best["p"], "d": nd, "pct": np_},
    "blend": {"grid": blend, "p": pb, "top": blend_top, "g4": DIG[4], "g9": DIG[9]},
    "p_untrained": p_untrained,
    "p_trained": p_trained,
    "disp": disp,
}

with open(os.path.join(OUT_DIR, "data.json"), "w") as f:
    json.dump(data, f, separators=(",", ":"))

print("train acc final:", hist["acc"][-1], " test acc final:", hist["tacc"][-1])
print("loss0:", hist["loss"][0], "lossN:", hist["loss"][-1])
print("snap count:", len(snaps), "last:", {k: snaps[-1][k] for k in ('e','acc','tacc')})
print("static ->", nd, np_, "%  | blend top:", blend_top)
print("s6 states:", [(s['label'], s['pred'], s['conf']) for s in s6_states])
print("untrained p[3]:", p_untrained[3], " trained p[3]:", p_trained[3])
print("disp:", disp)
