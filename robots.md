##DotIcon — an animated state-machine icon made of 16 dots that morph between configurations using Motion (formerly Framer Motion).

##Core concept:

16 dots with fixed opacity identities (some full, some 0.3) arranged in different spatial layouts depending on state. Uses fill="currentColor" throughout so color is controlled externally via CSS inheritance or the color prop.

##Two states currently exist, more can be added:

Dormant — static 4×4 grid, uniform dot size (5.5px). No animation loop.
Thinking — dots arranged on a Fibonacci sphere, continuously rotating around the Y axis via rAF. Z-depth is faked through dot size (4px back, 7px front) and z-sorting (front dots render on top). Rotation speed is 0.6 rad/s.

Animation architecture has two phases for animated states:

Morphing — Motion springs tween dots from their previous positions into the target sphere layout (~500ms, staggered 25ms per dot)
Spinning — rAF loop takes over, directly setting circle attributes each frame (no spring overhead during continuous rotation)

Switching back to a static state kills the loop and springs handle the return morph.
State registry pattern — STATES is a plain object where each entry has label, layout(angle?), animated, and speed. Adding a new state means adding one entry and a layout function. Layout functions return [{ x, y, size, z? }] in a 0–100 coordinate space. If animated: true, the component passes a continuously incrementing angle to the layout function.

Props: size (px, default 200), initialState, color, style.
Dependencies: motion/react (Motion). No other external deps.
