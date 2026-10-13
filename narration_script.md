# Narration script — 'How does a machine learn to read?'

Full voice-over / caption script with timings. Total runtime: **11 min 00 s** (12 scenes).
Times are seconds within each scene. Burned-in captions use the same text
(toggle per render with the `var_captions` column in `jobs.csv`).

## Prologue — The problem (40s)

- `[   1.0 →    5.5]`  Show a computer a handwritten 7 and, somehow, it knows what it is.
- `[   6.0 →   11.5]`  Eight different sevens: different slants, crossbars and noise.
- `[  12.5 →   18.0]`  Try writing rules by hand: a bright top row, a diagonal going down-left.
- `[  18.0 →   22.5]`  The next example always breaks them. Hand-written rules do not scale.
- `[  23.0 →   28.0]`  So flip the question: let the machine find its own rules, by turning knobs.
- `[  28.5 →   32.0]`  The network we will build has 562 of them.
- `[  32.0 →   36.5]`  Pixels, neurons, layers, error, descent, backpropagation. Six ideas.
- `[  37.0 →   39.5]`  Let's build one.

## Chapter 1 — Pictures are numbers (50s)

- `[   1.0 →    5.5]`  Start small: a digit on a grid, five pixels wide and seven tall.
- `[   5.5 →   10.5]`  Each square holds one number: its brightness, from 0 for black to 1 for white.
- `[  11.0 →   16.5]`  Zoom in, and the picture is nothing but a table of numbers.
- `[  17.0 →   22.5]`  Unroll the table, row after row, into one long list: thirty-five numbers.
- `[  23.5 →   28.5]`  That list is the input. Everything the network knows is in it.
- `[  29.0 →   34.5]`  Real handwriting datasets use 28 by 28 pixels: 784 numbers per digit.
- `[  35.0 →   40.5]`  A phone photo has tens of millions. Only the length of the list changes.
- `[  42.0 →   48.0]`  To a computer, a picture is a list of numbers. Learning to see means learning from lists.

## Chapter 2 — A single neuron (60s)

- `[   1.0 →    5.5]`  A neuron is a small machine: numbers go in, one number comes out.
- `[   5.5 →   10.5]`  Each input has a weight: positive means 'this helps', negative means 'this hurts'.
- `[  10.5 →   14.0]`  The neuron adds up every input times its weight.
- `[  14.0 →   17.0]`  First input: 0.9 times 1.5 gives 1.35.
- `[  17.0 →   20.0]`  Second: 0.2 times minus 2 gives minus 0.4.
- `[  20.0 →   24.0]`  Third: 0.56. The sum is 1.51; add a bias of minus 1 and we get 0.51.
- `[  25.0 →   30.0]`  Raw sums can be anything, so we squash the result into a range between 0 and 1.
- `[  30.5 →   36.0]`  The sigmoid: very negative gives almost 0, very positive gives almost 1.
- `[  37.0 →   41.0]`  Our 0.51 lands here: the neuron outputs about 0.62.
- `[  41.5 →   46.0]`  Shift the bias, and the neuron becomes harder or easier to excite.
- `[  46.5 →   51.0]`  Scale the weights, and its reaction gets sharper.
- `[  52.0 →   58.0]`  Weights and a bias. Every skill a network has is stored in numbers like these.

## Chapter 3 — Layers (55s)

- `[   1.0 →    5.5]`  One neuron is weak. Stack them in layers and something remarkable happens.
- `[   6.0 →   11.0]`  The first layer sees pixels. Each neuron in the next layer looks at all of them.
- `[  11.5 →   16.5]`  Every neuron connects to every neuron before it. Each line has its own weight.
- `[  17.0 →   22.5]`  The hope: early layers notice small strokes; later layers combine them into parts.
- `[  23.0 →   28.5]`  A loop. A stem. A hook. Parts combine into digits more easily than raw pixels do.
- `[  29.0 →   34.5]`  A nine is a loop on a stem. An eight is two loops. The last layer reads off the parts.
- `[  35.0 →   40.5]`  The middle layers are called hidden, because we never tell them what to look for.
- `[  41.0 →   46.5]`  That is the story people tell. The truth is messier, and we will check it.
- `[  47.0 →   53.0]`  For now: a network is neurons in layers, joined by weights. Nothing more.

## Chapter 4 — The knobs (45s)

- `[   1.0 →    6.0]`  35 pixels in, 12 hidden neurons, 10 outputs: one for each digit.
- `[   6.0 →   10.5]`  Every line is a weight, and each weight is a knob we can turn.
- `[  11.0 →   15.5]`  Between pixels and hidden layer: 35 times 12, so 420 weights.
- `[  15.5 →   18.5]`  Plus one bias for each of the 12 neurons.
- `[  19.0 →   23.5]`  Hidden to output: 12 times 10, so 120 weights, and 10 more biases.
- `[  24.0 →   28.5]`  Add it up: 420, 12, 120 and 10. A total of 562 numbers.
- `[  29.5 →   34.5]`  That is the whole network. Not a program someone wrote, just 562 numbers.
- `[  35.0 →   40.0]`  Modern language models have billions of them. The recipe stays the same.
- `[  40.5 →   44.0]`  So how do we find good values for them?

## Chapter 5 — Running the network (60s)

- `[   1.0 →    5.5]`  Let us watch a trained network work, before asking how it was trained.
- `[   6.0 →   11.5]`  Pixels go in. Each of the 35 input neurons holds one pixel's brightness.
- `[  12.0 →   17.5]`  Each hidden neuron takes a weighted sum, adds its bias, and squashes it.
- `[  18.0 →   23.5]`  Some light up, some stay dark: that pattern is the network's summary of the picture.
- `[  24.0 →   29.0]`  The output layer repeats the trick: a weighted sum for each of the ten digits.
- `[  29.5 →   34.5]`  Softmax turns those ten scores into probabilities that add up to one.
- `[  35.0 →   40.5]`  Here it says: a three, 99% confident. That is one forward pass.
- `[  41.0 →   45.5]`  Now a seven. Same 562 numbers, different picture, different answer.
- `[  45.5 →   49.5]`  Then a five. Same weights, new answer.
- `[  50.0 →   55.0]`  And a noisy eight, with pixels flipped: watch the confidence.
- `[  55.5 →   59.5]`  No rules about loops or strokes were written. Only numbers.

## Chapter 6 — How wrong is it? (50s)

- `[   1.0 →    5.5]`  Take the untrained network, with random weights, and show it a three.
- `[   6.0 →   11.0]`  Its ten outputs are nearly flat. It has no idea: each digit gets about a tenth.
- `[  11.5 →   16.5]`  We know the answer, so the target is simple: all the probability on the three.
- `[  17.0 →   21.5]`  We need one number that says how wrong the network is: a cost.
- `[  22.0 →   27.0]`  A good choice: minus the log of the probability given to the correct digit.
- `[  27.5 →   32.5]`  Give the right answer 10% and the loss is 2.27. High. The dot sits high on the curve.
- `[  33.0 →   38.5]`  As the network improves, p climbs toward 1 and the loss slides toward zero: 0.01.
- `[  39.0 →   44.0]`  Average that over thousands of examples and you get one score for the whole network.
- `[  45.0 →   49.0]`  Low cost means good weights. Training is the art of lowering it.

## Chapter 7 — Rolling downhill (70s)

- `[   1.0 →    5.5]`  Imagine the cost as a landscape. Turn one knob, and the height changes.
- `[   6.0 →   11.0]`  We want the bottom. But we only feel the slope right where we stand.
- `[  11.5 →   16.5]`  Here the slope points down to the right, so the sensible move is: step right.
- `[  17.0 →   22.5]`  Steeper slope, bigger step. Near the bottom the slope flattens, so steps shrink.
- `[  23.0 →   27.5]`  The size of the step is our choice: the learning rate.
- `[  28.0 →   33.0]`  Too small, and we crawl. Ten steps barely move us.
- `[  34.0 →   38.5]`  Too large, and we overshoot, bouncing from wall to wall, even climbing out.
- `[  39.5 →   43.5]`  So we pick a learning rate that is brave, but not reckless.
- `[  45.0 →   50.0]`  With two knobs we can draw the landscape. Rings join points of equal cost.
- `[  50.5 →   55.5]`  Descent follows the steepest way down, and zigzags toward the middle.
- `[  56.0 →   61.5]`  A real network has 562 knobs: a landscape in 562 dimensions. Same rule.
- `[  62.0 →   67.0]`  Update rule: new weight equals old weight, minus learning rate times slope.
- `[  67.0 →   69.5]`  Repeat, thousands of times.

## Chapter 8 — Who is to blame? (65s)

- `[   1.0 →    5.5]`  Descent needs a slope for every knob. How do we find all 562 slopes?
- `[   6.0 →   11.0]`  Shrink the network to a chain: one input, two weights, a loss. We can do this by hand.
- `[  11.5 →   16.5]`  Forward: 1 times 0.8 is 0.8, times minus 0.5 is minus 0.4. The target was 1.
- `[  17.0 →   21.5]`  The squared error is 1.96. Now: who is to blame for it?
- `[  22.0 →   27.0]`  Start at the end. If y rose a little, the loss would change by minus 2.8 times as much.
- `[  27.5 →   32.5]`  Weight w2 reaches y through h: blame is minus 2.8 times 0.8, so minus 2.24.
- `[  33.0 →   38.5]`  Keep going backwards: h gets 1.4, and w1 gets 1.4 times its input of 1.
- `[  39.0 →   44.0]`  That is the chain rule: blame flows backwards, multiplying local slopes as it goes.
- `[  45.0 →   50.0]`  Now nudge each weight against its slope, with a learning rate of 0.1.
- `[  50.5 →   55.5]`  The output moves from minus 0.4 to minus 0.18, and the loss falls to 1.40.
- `[  56.0 →   61.0]`  Backpropagation does exactly this, for all 562 weights, reusing work from later layers.
- `[  61.5 →   64.5]`  One pass forward. One pass back. One small step.

## Chapter 9 — Training (70s)

- `[   1.0 →    5.5]`  Time to train: start from random weights, then show it noisy digits again and again.
- `[   5.5 →   10.0]`  Each round: a forward pass, the cost, a backward pass, a small nudge to every weight.
- `[  10.5 →   15.0]`  Watch the cost on the left, and how often it is right on the right.
- `[  15.0 →   20.0]`  At first it guesses. Within a few rounds the cost collapses.
- `[  20.0 →   25.5]`  The digits below turn from red to green as the weights settle.
- `[  26.0 →   31.5]`  Then progress slows. Easy gains come first; polishing takes far longer.
- `[  32.0 →   37.5]`  This is why training runs so long: the last few percent are the hardest.
- `[  38.0 →   43.0]`  Final: 100% right on training digits, 100% on digits it has never seen.
- `[  43.5 →   48.0]`  That second number matters most: a network must work on new data.
- `[  49.0 →   54.0]`  Strip away the details and training is one loop, repeated again and again.
- `[  54.5 →   59.5]`  Forward, cost, backward, nudge. Real systems repeat it millions of times or more.
- `[  60.0 →   65.0]`  Nothing in that loop knows what a seven is. The knowledge ends up in the weights.
- `[  65.5 →   69.0]`  So what did the weights learn? Let us look inside.

## Chapter 10 — What did it learn? (55s)

- `[   1.0 →    5.5]`  Here are the 12 hidden neurons. Each grid shows its weights on the 35 pixels.
- `[   6.0 →   11.0]`  Blue pixels excite the neuron, red pixels inhibit it. Bright means a strong weight.
- `[  11.5 →   16.5]`  If the story from Chapter 3 were true, we would see neat loops and strokes.
- `[  17.0 →   22.0]`  Instead: blurry, overlapping templates. Each neuron is a messy vote on the whole picture.
- `[  22.5 →   27.5]`  Together they work, but the meaning is spread across many neurons.
- `[  28.0 →   33.0]`  Now a test. Feed it pure random static: an image of nothing at all.
- `[  33.5 →   38.5]`  It answers 9, 96% sure. It was never taught to say 'I do not know'.
- `[  39.0 →   44.0]`  Blend a four and a nine, and its belief splits between the two it knows.
- `[  44.5 →   49.5]`  A network only knows the world it was trained on, and it does not know its limits.
- `[  50.0 →   54.5]`  Understanding that gap matters as much as understanding the math.

## Recap — Putting it together (40s)

- `[   1.0 →    5.5]`  Let us put it together. A picture is a list of numbers.
- `[   6.0 →   10.5]`  A neuron takes a weighted sum, adds a bias and squashes the result.
- `[  11.0 →   15.5]`  Neurons stack in layers, joined by weights. Ours had 562.
- `[  16.0 →   20.5]`  A cost function turns 'how wrong' into a single number.
- `[  21.0 →   25.5]`  Gradient descent says: nudge every weight downhill.
- `[  26.0 →   30.5]`  Backpropagation finds every slope by sending blame backwards.
- `[  31.0 →   35.0]`  In one line: new weights equal old weights, minus a step downhill.
- `[  35.5 →   39.5]`  Change the hidden layer's size and see what breaks. That is how intuition grows.

