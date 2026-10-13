#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_video.py — assembles the 12 self-contained Hyperframes compositions.

Inputs : scripts/engine.js, scripts/shell.html, scripts/scenes/sXX.js,
         scripts/build/data.json (from nn_build.py)
Outputs: download/hyperframes_nn_video/<scene_folder>/index.html  (x12)
         download/hyperframes_nn_video/jobs.csv
         download/hyperframes_nn_video/concat_list.txt
         download/hyperframes_nn_video/narration_script.md
"""
import json, os

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "..", "download", "hyperframes_nn_video")
SC = os.path.join(ROOT, "scenes")

D = json.load(open(os.path.join(ROOT, "build", "data.json")))
disp = D["disp"]

def sub(s):
    for k, v in disp.items():
        s = s.replace("{" + k + "}", str(v))
    return s

# --------------------------------------------------------------- metadata ---
# durations + narration = single source of truth (drives scene HTML, jobs.csv,
# concat list and the narration script).
SCENES = [
 dict(id="s01_hook", dur=40, chapter="Prologue", title="The problem", accent="#FFE45C", narr=[
  (1.0,4.5,"Show a computer a handwritten 7 and, somehow, it knows what it is."),
  (6.0,5.5,"Eight different sevens: different slants, crossbars and noise."),
  (12.5,5.5,"Try writing rules by hand: a bright top row, a diagonal going down-left."),
  (18.0,4.5,"The next example always breaks them. Hand-written rules do not scale."),
  (23.0,5.0,"So flip the question: let the machine find its own rules, by turning knobs."),
  (28.5,3.5,"The network we will build has 562 of them."),
  (32.0,4.5,"Pixels, neurons, layers, error, descent, backpropagation. Six ideas."),
  (37.0,2.5,"Let's build one.")]),
 dict(id="s02_pixels", dur=50, chapter="Chapter 1", title="Pictures are numbers", accent="#58C4DD", narr=[
  (1.0,4.5,"Start small: a digit on a grid, five pixels wide and seven tall."),
  (5.5,5.0,"Each square holds one number: its brightness, from 0 for black to 1 for white."),
  (11.0,5.5,"Zoom in, and the picture is nothing but a table of numbers."),
  (17.0,5.5,"Unroll the table, row after row, into one long list: thirty-five numbers."),
  (23.5,5.0,"That list is the input. Everything the network knows is in it."),
  (29.0,5.5,"Real handwriting datasets use 28 by 28 pixels: 784 numbers per digit."),
  (35.0,5.5,"A phone photo has tens of millions. Only the length of the list changes."),
  (42.0,6.0,"To a computer, a picture is a list of numbers. Learning to see means learning from lists.")]),
 dict(id="s03_neuron", dur=60, chapter="Chapter 2", title="A single neuron", accent="#5FD3BC", narr=[
  (1.0,4.5,"A neuron is a small machine: numbers go in, one number comes out."),
  (5.5,5.0,"Each input has a weight: positive means 'this helps', negative means 'this hurts'."),
  (10.5,3.5,"The neuron adds up every input times its weight."),
  (14.0,3.0,"First input: 0.9 times 1.5 gives 1.35."),
  (17.0,3.0,"Second: 0.2 times minus 2 gives minus 0.4."),
  (20.0,4.0,"Third: 0.56. The sum is 1.51; add a bias of minus 1 and we get 0.51."),
  (25.0,5.0,"Raw sums can be anything, so we squash the result into a range between 0 and 1."),
  (30.5,5.5,"The sigmoid: very negative gives almost 0, very positive gives almost 1."),
  (37.0,4.0,"Our 0.51 lands here: the neuron outputs about 0.62."),
  (41.5,4.5,"Shift the bias, and the neuron becomes harder or easier to excite."),
  (46.5,4.5,"Scale the weights, and its reaction gets sharper."),
  (52.0,6.0,"Weights and a bias. Every skill a network has is stored in numbers like these.")]),
 dict(id="s04_layers", dur=55, chapter="Chapter 3", title="Layers", accent="#B57EDC", narr=[
  (1.0,4.5,"One neuron is weak. Stack them in layers and something remarkable happens."),
  (6.0,5.0,"The first layer sees pixels. Each neuron in the next layer looks at all of them."),
  (11.5,5.0,"Every neuron connects to every neuron before it. Each line has its own weight."),
  (17.0,5.5,"The hope: early layers notice small strokes; later layers combine them into parts."),
  (23.0,5.5,"A loop. A stem. A hook. Parts combine into digits more easily than raw pixels do."),
  (29.0,5.5,"A nine is a loop on a stem. An eight is two loops. The last layer reads off the parts."),
  (35.0,5.5,"The middle layers are called hidden, because we never tell them what to look for."),
  (41.0,5.5,"That is the story people tell. The truth is messier, and we will check it."),
  (47.0,6.0,"For now: a network is neurons in layers, joined by weights. Nothing more.")]),
 dict(id="s05_knobs", dur=45, chapter="Chapter 4", title="The knobs", accent="#FFC53D", narr=[
  (1.0,5.0,"35 pixels in, 12 hidden neurons, 10 outputs: one for each digit."),
  (6.0,4.5,"Every line is a weight, and each weight is a knob we can turn."),
  (11.0,4.5,"Between pixels and hidden layer: 35 times 12, so 420 weights."),
  (15.5,3.0,"Plus one bias for each of the 12 neurons."),
  (19.0,4.5,"Hidden to output: 12 times 10, so 120 weights, and 10 more biases."),
  (24.0,4.5,"Add it up: 420, 12, 120 and 10. A total of 562 numbers."),
  (29.5,5.0,"That is the whole network. Not a program someone wrote, just 562 numbers."),
  (35.0,5.0,"Modern language models have billions of them. The recipe stays the same."),
  (40.5,3.5,"So how do we find good values for them?")]),
 dict(id="s06_forward", dur=60, chapter="Chapter 5", title="Running the network", accent="#58C4DD", narr=[
  (1.0,4.5,"Let us watch a trained network work, before asking how it was trained."),
  (6.0,5.5,"Pixels go in. Each of the 35 input neurons holds one pixel's brightness."),
  (12.0,5.5,"Each hidden neuron takes a weighted sum, adds its bias, and squashes it."),
  (18.0,5.5,"Some light up, some stay dark: that pattern is the network's summary of the picture."),
  (24.0,5.0,"The output layer repeats the trick: a weighted sum for each of the ten digits."),
  (29.5,5.0,"Softmax turns those ten scores into probabilities that add up to one."),
  (35.0,5.5,"Here it says: a three, {p3}% confident. That is one forward pass."),
  (41.0,4.5,"Now a seven. Same 562 numbers, different picture, different answer."),
  (45.5,4.0,"Then a five. Same weights, new answer."),
  (50.0,5.0,"And a noisy eight, with pixels flipped: watch the confidence."),
  (55.5,4.0,"No rules about loops or strokes were written. Only numbers.")]),
 dict(id="s07_cost", dur=50, chapter="Chapter 6", title="How wrong is it?", accent="#FC6255", narr=[
  (1.0,4.5,"Take the untrained network, with random weights, and show it a three."),
  (6.0,5.0,"Its ten outputs are nearly flat. It has no idea: each digit gets about a tenth."),
  (11.5,5.0,"We know the answer, so the target is simple: all the probability on the three."),
  (17.0,4.5,"We need one number that says how wrong the network is: a cost."),
  (22.0,5.0,"A good choice: minus the log of the probability given to the correct digit."),
  (27.5,5.0,"Give the right answer {q0}% and the loss is {l0}. High. The dot sits high on the curve."),
  (33.0,5.5,"As the network improves, p climbs toward 1 and the loss slides toward zero: {l1}."),
  (39.0,5.0,"Average that over thousands of examples and you get one score for the whole network."),
  (45.0,4.0,"Low cost means good weights. Training is the art of lowering it.")]),
 dict(id="s08_descent", dur=70, chapter="Chapter 7", title="Rolling downhill", accent="#FF9F43", narr=[
  (1.0,4.5,"Imagine the cost as a landscape. Turn one knob, and the height changes."),
  (6.0,5.0,"We want the bottom. But we only feel the slope right where we stand."),
  (11.5,5.0,"Here the slope points down to the right, so the sensible move is: step right."),
  (17.0,5.5,"Steeper slope, bigger step. Near the bottom the slope flattens, so steps shrink."),
  (23.0,4.5,"The size of the step is our choice: the learning rate."),
  (28.0,5.0,"Too small, and we crawl. Ten steps barely move us."),
  (34.0,4.5,"Too large, and we overshoot, bouncing from wall to wall, even climbing out."),
  (39.5,4.0,"So we pick a learning rate that is brave, but not reckless."),
  (45.0,5.0,"With two knobs we can draw the landscape. Rings join points of equal cost."),
  (50.5,5.0,"Descent follows the steepest way down, and zigzags toward the middle."),
  (56.0,5.5,"A real network has 562 knobs: a landscape in 562 dimensions. Same rule."),
  (62.0,5.0,"Update rule: new weight equals old weight, minus learning rate times slope."),
  (67.0,2.5,"Repeat, thousands of times.")]),
 dict(id="s09_backprop", dur=65, chapter="Chapter 8", title="Who is to blame?", accent="#FC6255", narr=[
  (1.0,4.5,"Descent needs a slope for every knob. How do we find all 562 slopes?"),
  (6.0,5.0,"Shrink the network to a chain: one input, two weights, a loss. We can do this by hand."),
  (11.5,5.0,"Forward: 1 times 0.8 is 0.8, times minus 0.5 is minus 0.4. The target was 1."),
  (17.0,4.5,"The squared error is 1.96. Now: who is to blame for it?"),
  (22.0,5.0,"Start at the end. If y rose a little, the loss would change by minus 2.8 times as much."),
  (27.5,5.0,"Weight w2 reaches y through h: blame is minus 2.8 times 0.8, so minus 2.24."),
  (33.0,5.5,"Keep going backwards: h gets 1.4, and w1 gets 1.4 times its input of 1."),
  (39.0,5.0,"That is the chain rule: blame flows backwards, multiplying local slopes as it goes."),
  (45.0,5.0,"Now nudge each weight against its slope, with a learning rate of 0.1."),
  (50.5,5.0,"The output moves from minus 0.4 to minus 0.18, and the loss falls to 1.40."),
  (56.0,5.0,"Backpropagation does exactly this, for all 562 weights, reusing work from later layers."),
  (61.5,3.0,"One pass forward. One pass back. One small step.")]),
 dict(id="s10_training", dur=70, chapter="Chapter 9", title="Training", accent="#7EC96B", narr=[
  (1.0,4.5,"Time to train: start from random weights, then show it noisy digits again and again."),
  (5.5,4.5,"Each round: a forward pass, the cost, a backward pass, a small nudge to every weight."),
  (10.5,4.5,"Watch the cost on the left, and how often it is right on the right."),
  (15.0,5.0,"At first it guesses. Within a few rounds the cost collapses."),
  (20.0,5.5,"The digits below turn from red to green as the weights settle."),
  (26.0,5.5,"Then progress slows. Easy gains come first; polishing takes far longer."),
  (32.0,5.5,"This is why training runs so long: the last few percent are the hardest."),
  (38.0,5.0,"Final: {acc}% right on training digits, {tacc}% on digits it has never seen."),
  (43.5,4.5,"That second number matters most: a network must work on new data."),
  (49.0,5.0,"Strip away the details and training is one loop, repeated again and again."),
  (54.5,5.0,"Forward, cost, backward, nudge. Real systems repeat it millions of times or more."),
  (60.0,5.0,"Nothing in that loop knows what a seven is. The knowledge ends up in the weights."),
  (65.5,3.5,"So what did the weights learn? Let us look inside.")]),
 dict(id="s11_inside", dur=55, chapter="Chapter 10", title="What did it learn?", accent="#B57EDC", narr=[
  (1.0,4.5,"Here are the 12 hidden neurons. Each grid shows its weights on the 35 pixels."),
  (6.0,5.0,"Blue pixels excite the neuron, red pixels inhibit it. Bright means a strong weight."),
  (11.5,5.0,"If the story from Chapter 3 were true, we would see neat loops and strokes."),
  (17.0,5.0,"Instead: blurry, overlapping templates. Each neuron is a messy vote on the whole picture."),
  (22.5,5.0,"Together they work, but the meaning is spread across many neurons."),
  (28.0,5.0,"Now a test. Feed it pure random static: an image of nothing at all."),
  (33.5,5.0,"It answers {nd}, {np}% sure. It was never taught to say 'I do not know'."),
  (39.0,5.0,"Blend a four and a nine, and its belief splits between the two it knows."),
  (44.5,5.0,"A network only knows the world it was trained on, and it does not know its limits."),
  (50.0,4.5,"Understanding that gap matters as much as understanding the math.")]),
 dict(id="s12_outro", dur=40, chapter="Recap", title="Putting it together", accent="#58C4DD", narr=[
  (1.0,4.5,"Let us put it together. A picture is a list of numbers."),
  (6.0,4.5,"A neuron takes a weighted sum, adds a bias and squashes the result."),
  (11.0,4.5,"Neurons stack in layers, joined by weights. Ours had 562."),
  (16.0,4.5,"A cost function turns 'how wrong' into a single number."),
  (21.0,4.5,"Gradient descent says: nudge every weight downhill."),
  (26.0,4.5,"Backpropagation finds every slope by sending blame backwards."),
  (31.0,4.0,"In one line: new weights equal old weights, minus a step downhill."),
  (35.5,4.0,"Change the hidden layer's size and see what breaks. That is how intuition grows.")]),
]

# per-scene data subsets
SUBSETS = {
 "s01_hook":   lambda d: {"sevens": d["sevens"]},
 "s02_pixels": lambda d: {"dig3": d["dig"][3], "g28": d["g28"]},
 "s03_neuron": lambda d: {},
 "s04_layers": lambda d: {},
 "s05_knobs":  lambda d: {"net": d["net"], "disp": {"widx": d["disp"]["widx"]}},
 "s06_forward":lambda d: {"net": d["net"], "s6": d["s6"]},
 "s07_cost":   lambda d: {"p_untrained": d["p_untrained"], "p_trained": d["p_trained"], "dig3": d["dig"][3]},
 "s08_descent":lambda d: {},
 "s09_backprop":lambda d: {},
 "s10_training":lambda d: {"hist": d["hist"], "snaps": d["snaps"], "test_digits": d["test_digits"]},
 "s11_inside": lambda d: {"net": d["net"], "static": d["static"], "blend": d["blend"]},
 "s12_outro":  lambda d: {},
}

engine_js = open(os.path.join(ROOT, "engine.js")).read()
shell = open(os.path.join(ROOT, "shell.html")).read()

os.makedirs(OUT, exist_ok=True)
jobs_rows = ["folder,html,output_name,enabled,overwrite,fps,quality,resolution,format,gpu,browser_gpu,workers,extra_args,var_captions"]
concat = []
total = 0
narr_md = ["# Narration script — 'How does a machine learn to read?'",
           "",
           "Full voice-over / caption script with timings. Total runtime: **11 min 00 s** (12 scenes).",
           "Times are seconds within each scene. Burned-in captions use the same text",
           "(toggle per render with the `var_captions` column in `jobs.csv`).",
           ""]

for sc in SCENES:
    sid = sc["id"]
    total += sc["dur"]
    scene_js = open(os.path.join(SC, sid.split("_")[0] + ".js")).read()
    data = SUBSETS[sid](D)
    data["narr"] = [[t0, d1, sub(txt)] for (t0, d1, txt) in sc["narr"]]

    html = (shell
            .replace("__DUR__", str(sc["dur"]))
            .replace("__TITLE__", "Hyperframes · " + sc["chapter"] + " — " + sc["title"])
            .replace("/*__DATA__*/", "const DATA = " + json.dumps(data, separators=(",", ":")) + ";")
            .replace("/*__ENGINE__*/", engine_js)
            .replace("/*__SCENE__*/", scene_js))
    folder = os.path.join(OUT, sid)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "index.html"), "w") as f:
        f.write(html)

    jobs_rows.append(",".join([sid, "", sid, "yes", "no", "30", "looks", "landscape",
                               "mp4", "yes", "yes", "auto", "", "true"]))
    concat.append("file '%s/%s.mp4'" % (sid, sid))

    narr_md.append("## %s — %s (%ds)" % (sc["chapter"], sc["title"], sc["dur"]))
    narr_md.append("")
    for (t0, d1, txt) in data["narr"]:
        narr_md.append("- `[%6.1f → %6.1f]`  %s" % (t0, t0 + d1, txt))
    narr_md.append("")

with open(os.path.join(OUT, "jobs.csv"), "w") as f:
    f.write("\n".join(jobs_rows) + "\n")
with open(os.path.join(OUT, "concat_list.txt"), "w") as f:
    f.write("\n".join(concat) + "\n")
with open(os.path.join(OUT, "narration_script.md"), "w") as f:
    f.write("\n".join(narr_md) + "\n")

print("scenes:", len(SCENES), "| total duration:", total, "s =", round(total / 60, 2), "min")
print("wrote", OUT)
