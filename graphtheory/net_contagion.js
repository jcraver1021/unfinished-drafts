/**
 * MIT License
 *
 * Copyright (c) 2020 James Craver
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/**
 * @fileOverview Simulate infection propagation through a weighted, undirected graph.
 */

/**
* Infection simulation state.
*/
class ContagionSimulation {
	/**
	 * Build a ContagionSimulation
	 * @param {Object} options The settings for this run: 
	 *   width - Width of canvas (default 120)
	 *   height - Height of canvas (default 120)
	 *   radius - Radius of nodes (default 20)
	 *   margin - Margin between nodes (default 1)
	 *   maxWidth - Maximium drawn edge width (default 5)
	 *   maxHeat - Size increase of infected nodes (default 10)
	 *   refreshIntervalMs - Milliseconds between each frame (default 20)
	 *   decayFrames - Number of frames for each decay of a unit of heat (default 10)
	 *   build - How to build the network. Options:
	 *           "square": Build a rectangular network within the canvas.
	 *   id - The ID of the HTML element to put this canvas under.
	 *        If absent, defaults to the document body.
	 */
	constructor(options = {}) {
		this.nodes = [];
		this.edges = [];

		// Initialize options
		this.width = options.width || 120;
		this.height = options.height || 120;
		this.radius = options.radius || 20;
		this.margin = options.margion || 1;
		this.maxWidth = options.maxWidth || 5;
		this.maxHeat = options.maxHeat || 10;
		this.refreshIntervalMs = options.refreshIntervalMs || 20;
		this.decayFrames = options.decayFrames || 10;
		this.build = options.build;
		this.id = options.id;

		// Construct the network.
		switch (this.build) {
			case "square":
				// build a square sized appropriately for the thingy
				let baseOffset = this.radius + this.maxHeat + this.margin;
				let delta = 2 * (this.radius + this.maxHeat) + this.margin;
				let nWide = null;
				for (let y = baseOffset; y + baseOffset < this.height; y += delta) {
					for (let x = baseOffset; x + baseOffset < this.width; x += delta) {
						this.nodes.push(new FeverNode(x, y, this.radius, this.maxHeat, this.decayFrames));
						if (x > baseOffset) {
							this.edges.push(new WeightedEdge(this.nodes[this.nodes.length - 1], this.nodes[this.nodes.length - 2], Math.random()));
						}
						if (nWide !== null) {
							this.edges.push(new WeightedEdge(this.nodes[this.nodes.length - 1], this.nodes[this.nodes.length - nWide - 1], Math.random()));
						}
					}
					// If we are past the first row, start connecting to your neighbors above you.
					if (nWide === null) {
						nWide = this.nodes.length;
					}
				}
				break;
		}

		// Construct the simulation area
		this.canvas = document.createElement("canvas");
		this.canvas.width = this.width;
		this.canvas.height = this.height;
		this.context = this.canvas.getContext("2d");
		this.clicks = [];
		this.canvas.addEventListener("click", ev => this.clicks.push([ev.clientX, ev.clientY]));
		let element;
		if (this.id !== null) {
			element = document.getElementById(this.id);
		}
		else {
			element = document.body;
		}
		element.insertBefore(this.canvas, element.childNodes[0]);

		this.drawInterval = null;
	}

	/**
	 * Start the simulation.
	 */
	start() {
		this.drawInterval = setInterval(() => this.updateGameArea(), this.refreshIntervalMs);
	}

	/**
	 * Pause the simulation.
	 */
	stop() {
		clearInterval(this.drawInterval);
	}

	/**
	 * Update the game area.
	 * 
	 * 1) Clear the canvas.
	 * 2) If a node has been clicked on, infect that node.
	 * 3) Update each node's apparent location/size.
	 * 4) Draw each edge.
	 * 5) Have all infected nodes try to infect their neighbors.
	 * 6) Mark each node thusly infected as such.
	 * 7) Draw each node.
	 */
	updateGameArea() {
		this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

		// Determine which node (if any) was clicked on.
		if (this.clicks.length > 0) {
			let clickPos = this.clicks.shift(); // yes I know this is O(n); n is likely very small.
			let minNode = null;
			let min = Infinity;
			// TODO: Do something better than a linear search of all nodes.
			this.nodes.forEach((node) => {
				let d1 = node.x - clickPos[0];
				let d2 = node.y - clickPos[1];
				let dist = Math.sqrt(d1 * d1 + d2 * d2);
				if (dist < min) {
					minNode = node;
					min = dist;
				}
			});
			if (minNode !== null) {
				minNode.makeHot();
			}
		}
		this.nodes.forEach((node) =>
			node.update()
		);
		this.edges.forEach((edge) =>
			edge.draw(this.context, this.maxWidth)
		);
		// Step 1 of "two-phase" infect
		this.nodes.forEach((node) =>
			node.heatNeighbors()
		);
		// St2p 2 of "two-phase" infect
		this.nodes.forEach((node) => {
			if (node.tagged) {
				node.tagged = false;
				node.makeHot();
			}
		});
		this.nodes.forEach((node) =>
			node.draw(this.context)
		);
	}
}

/**
 * A node that can be infected by other nodes. Shakes more strongly if recently infected.
 */
class FeverNode {
	/**
	 * Constuct a FeverNode.
	 * @param {number} x The x position of the node.
	 * @param {number} y The y position of the node.
	 * @param {number} r The radisu of the node when drawn.
	 * @param {number} hmax The "heat" capacity of the node.
	 *                      When infected, its heat becomes this value.
	 * @param {number} dmax The number of frames it takes for a unit of heat to decay.
	 */
	constructor(x, y, r, hmax, dmax) {
		this.x = x;
		this.y = y;
		this.r = r;
		this.apparentX = x;
		this.apparentY = y;
		this.apparentR = r;
		this.heat = 1;
		this.decayTimer = 0;
		this.decayFrames = dmax;
		this.madeHot = false;
		this.tagged = false;
		this.connections = new Set();
		this.maxHeat = hmax;
	}

	/**
	 * Draw the node as a circle on the given 2D context.
	 * Its x, y, and radius values will be perturbed in correspondence with its current heat.
	 * Its color will appear blue when not infected, red when infected, and somewhere in between
	 * as the infection decays.
	 * @param {CanvasRenderingContext2D} ctx The context in which to draw the node.
	 */
	draw(ctx) {
		ctx.beginPath();
		ctx.arc(this.apparentX, this.apparentY, this.apparentR, 0, 2 * Math.PI, false);
		ctx.fillStyle = rgb(255 * (this.heat / this.maxHeat), 0, 255 * (this.maxHeat - this.heat) / this.maxHeat)
		ctx.fill();
	}

	/**
	 * Randomly perturb the apparent location and size of the node (the original values are lost).
	 * Decay the heat of the node (if any is present).
	 */
	update() {
		this.apparentX = this.x + centeredPerturbation(this.heat);
		this.apparentY = this.y + centeredPerturbation(this.heat);
		this.apparentR = this.r + this.heat;
		if (this.heat > 1 && this.decayTimer++ >= this.decayFrames) {
			this.heat--;
			this.decayTimer = 0;
		}
	}

	/**
	 * Execute an infection event on the node:
	 * Heat the node to maximum heat,
	 * reset its decay timer,
	 * and mark that it has been made hot.
	 */
	makeHot() {
		this.heat = this.maxHeat;
		this.decayTimer = 0;
		this.madeHot = true;
	}

	/**
	 * Return whether a node's heat is greater than background (1).
	 */
	isHot() {
		return this.heat > 1;
	}

	/**
	 * If the node has been infected last round, infect each neighbor probabilistically.
	 * Mark no longer infected for the purposes of spread.
	 */
	heatNeighbors() {
		if (this.madeHot) {
			this.connections.forEach((edge) => {
				if (!edge.t.isHot() && Math.random() < edge.weight) {
					edge.t.tagged = true;
				}
			});
			this.madeHot = false;
		}
	}
}

/**
 * A weighted edge between two nodes in a graph.
 */
class WeightedEdge {
	/**
	 * Create a weighted edge.
	 * @param {FeverNode} s The source node.
	 * @param {FeverNode} t The target node.
	 * @param {number} weight The node's weight.
	 * @param {boolean} undirected If true, constructor will create a mirrored edge from t to s.
	 *                             This edge will not be returned to you; it will only exist in the target's adjacency list.
	 */
	constructor(s, t, weight, undirected = true) {
		this.s = s;
		this.t = t;
		this.weight = weight;
		// Populate the nodes' adjacency lists.
		if (undirected) {
			this.s.connections.add(this);
			this.t.connections.add(new WeightedEdge(t, s, weight, false));
		}
	}

	/**
	 * Draw the edge as a line in the 2D context. The thickness corresponds to the weight.
	 * @param {CanvasRenderingContext2D} ctx The context to draw in.
	 * @param {number} mw The maximum width of the line (defaults to 1).
	 */
	draw(ctx, mw = 1) {
		ctx.beginPath();
		ctx.moveTo(this.s.apparentX, this.s.apparentY);
		ctx.lineTo(this.t.apparentX, this.t.apparentY);
		ctx.lineWidth = mw * this.weight;
		ctx.stroke();
	}
}

/**
 * Return a 1 or a 0 with equal probability.
 * @returns A 1 or a 0.
 */
function randomBit() {
	return Math.random() > 0.5 ? 1 : 0;
}

/**
 * Randomly shift a number up to maxDelta away.
 * @param {number} maxDelta The maximum distance to shift.
 */
function centeredPerturbation(maxDelta) {
	s = 0
	for (i = 0; i < maxDelta; i++) {
		s += randomBit();
		s -= randomBit();
	}
	return s;
}

/**
 * Encode the RGB value of a color.
 * @param {number} r Red
 * @param {number} g Green
 * @param {number} b Blue
 */
function rgb(r, g, b) {
	return ["rgb(", r, ",", g, ",", b, ")"].join("");
}