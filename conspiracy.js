"use strict";

function randomChance(chance) {
	if (chance <= 0) return false;
	if (chance >= 1) return true;
	return Math.random() < chance;
}

function randomRange(min, max) {
	return min + Math.random() * (max - min);
}

function randomInt(max) {
	return Math.floor(max * Math.random());
}

function randomChoice(arr) {
	if (arr.length === 1) {
		return arr[0];
	}
	return arr[randomInt(arr.length)];
}

function randomWeightedChoice(items, weightFunc) {
	let totalWeight = 0;
	const weighted = [];
	for (const item of items) {
		const weight = weightFunc(item);
		if (weight > 0) {
			const minWeight = totalWeight;
			totalWeight += weight;
			weighted.push({
				minWeight,
				maxWeight: totalWeight,
				item,
			});
		}
	}

	if (weighted.length === 0) {
		return undefined;
	}

	const targetWeight = Math.random() * totalWeight;

	// Binary search for the target entry
	let min = 0;
	let max = weighted.length - 1;
	while (min < max) {
		const mid = (min >> 1) + (max >> 1);
		const curr = weighted[mid];
		if (targetWeight >= curr.maxWeight) {
			min = mid + 1;
		} else if (targetWeight < curr.minWeight) {
			max = mid;
		} else {
			return curr.item;
		}
	}
	return weighted[min].item;
}

class ExclusiveTimeout {
	constructor() {
		this.activeTimeout = null;
	}

	get isActive() {
		return this.activeTimeout !== null;
	}

	start(callback, delayMs) {
		this.cancel();
		this.activeTimeout = setTimeout(() => {
			this.activeTimeout = null;
			callback();
		}, delayMs);
	}

	cancel() {
		if (this.isActive) {
			clearTimeout(this.activeTimeout);
			this.activeTimeout = null;
		}
	}
}

class ToneValue {
	constructor(values, defaultValue) {
		if (typeof values === 'object') {
			this.calm = (values.calm !== undefined) ? values.calm : defaultValue;
			this.wild = (values.wild !== undefined) ? values.wild : defaultValue;
		} else {
			this.calm = this.wild = (values !== undefined) ? values : defaultValue;
		}
	}

	deduplicate(cache) {
		// Avoid keeping hundreds of identical objects in memory
		// Probably not a significant optimization but w/e
		const key = this.calm + '\0' + this.wild;
		if (!(key in cache)) {
			cache[key] = this;
			return this;
		}
		const cached = cache[key];
		if (cached.calm === this.calm && cached.wild === this.wild) {
			return cached;
		}
		return this;
	}

	get usesTone() {
		return this.calm === this.wild;
	}

	get(isWild) {
		return isWild ? this.wild : this.calm;
	}
}

class FragmentDef {
	constructor({
		id, text, punctuate=true,
		punctuation_mark, sentence_start, sentence_end,
	}, punctuationMarkCache) {
		this.id = id;
		this.text = new ToneValue(text, "");
		this.punctuate = punctuate;
		this.punctuationMark = new ToneValue(punctuation_mark, ".");
		if (punctuationMarkCache) {
			this.punctuationMark =
				this.punctuationMark.deduplicate(punctuationMarkCache);
		}
		this.isSentenceStart = sentence_start;
		this.isSentenceEnd = sentence_end;
		this.usesTone = this.text.usesTone || this.punctuationMark.usesTone;
	}
}

class FragmentCategory {
	constructor(id) {
		this.id = id;
	}

	_init(builder, {length_factor, next, fragments}) {
		this.lengthFactor = length_factor;
		this.nextCategories = next.map(builder.getCategory);
		this.fragments = fragments.map(
			def => new FragmentDef(def, builder.punctuationMarkCache));
		this.minLengthToEnd = Infinity;
	}

	_initMinLengthToEnd() {
		if (this.minLengthToEnd === Infinity) {
			for (const next of this.nextCategories) {
				const lengthToEnd = next ? 1 + next._initMinLengthToEnd() : 0;
				if (lengthToEnd < this.minLengthToEnd) {
					this.minLengthToEnd = lengthToEnd;
					this.minLengthNextCategory = next;
				}
			}
		}
		return this.minLengthToEnd;
	}

	chooseFragment() {
		return randomChoice(this.fragments);
	}

	chooseNextCategory(lengthBonus) {
		if (lengthBonus === 0) {
			return randomChoice(this.nextCategories);
		}
		return randomWeightedChoice(this.nextCategories, category => {
			if (!category) return 1;
			return Math.max(0, 1 + (this.lengthFactor * lengthBonus));
		});
	}
}

class ConspiracyBuilder {
	constructor({
		sentence_starts, prebuilts, mixins, categories
	}, {
		avoidPrebuiltFirstTime = true,
		maxLength = 1000,
	} = {}) {
		this.categories = Object.create(null);
		this.punctuationMarkCache = Object.create(null);
		this.allowRandomPrebuilt = !avoidPrebuiltFirstTime;
		this.maxLength = maxLength;
		this.getCategory = this.getCategory.bind(this);
		// Two passes to enable category lookup
		for (const id in categories) {
			this.categories[id] = new FragmentCategory(id);
		}
		for (const id in categories) {
			this.categories[id]._init(this, categories[id]);
		}
		this.sentenceStarts = this.getCategory(sentence_starts);
		this.prebuilts = this.getCategory(prebuilts);
		this.mixins = this.getCategory(mixins);

		this.sentenceStarts._initMinLengthToEnd();
		this.prebuilts._initMinLengthToEnd();
	}

	getCategory(id) {
		const c = this.categories[id];
		if (!c) throw new Error(`No such category as "${id}"`);
		return c;
	}

	buildConspiracy(prebuiltChance, mixinChance, lengthBonus) {
		const result = new Conspiracy();

		let category;
		if (prebuiltChance >= 1 || (this.allowRandomPrebuilt && randomChance(prebuiltChance))) {
			category = this.prebuilts;
		} else {
			category = this.sentenceStarts;
			this.allowRandomPrebuilt = true;
		}

		while (category !== null) {
			result.addFragment(category);
			if (this._mustEndConspiracy(result, category)) {
				return result;
			}
			// Add mixins. Decrease chance by half each time,
			// to discourage long strings of mixins.
			for (
				let tempChance = mixinChance;
				randomChance(tempChance);
				tempChance /= 2
			) {
				result.addFragment(this.mixins);
				if (this._mustEndConspiracy(result, category)) {
					return result;
				}
			}
			category = category.chooseNextCategory(lengthBonus);
		}
		return result;
	}

	_mustEndConspiracy(conspiracy, category) {
		if (conspiracy.length + category.minLengthToEnd < this.maxLength) {
			return false;
		}
		// End the sentence ASAP
		for (
			category = category.minLengthNextCategory;
			category !== null;
			category = category.minLengthNextCategory
		) {
			result.addFragment(category);
		}
		return true;
	}
}

class FragmentInst {
	constructor(def) {
		this.def = def;
		this.toneThreshold = Math.random();
	}

	getTone(wildChance) {
		return (wildChance > this.toneThreshold) ? "wild" : "calm";
	}

	getSoundUrl(wildChance) {
		return `sounds/line_${this.def.id}_${this.getTone(wildChance)}.mp3`;
	}
}

class Conspiracy {
	constructor() {
		this.fragments = [];
	}

	addFragment(category) {
		this.fragments.push(new FragmentInst(category.chooseFragment()));
	}

	get length() {
		return this.fragments.length;
	}
}

class ChangeableValue {
	constructor(value) {
		this._value = value;
		this._listeners = [];
	}

	get value() {
		return this._value;
	}

	set value(value) {
		if (Object.is(this._value, value)) {
			return;
		}
		const oldValue = this._value;
		this._value = value;
		for (const callback of this._listeners) {
			callback(value, oldValue, this);
		}
	}

	onChanged(callback) {
		this._listeners.push(callback);
	}
}

class ConspiracyPlayer {
	constructor({
		getNewConspiracy,
		getFragmentDelay,
		getConspiracyDelay,
		getShouldLoop,
		wildChance,
	}) {
		this.getNewConspiracy = getNewConspiracy;
		this.getFragmentDelay = getFragmentDelay;
		this.getConspiracyDelay = getConspiracyDelay;
		this.getShouldLoop = getShouldLoop;
		this.wildChance = wildChance;

		this._conspiracy = null;
		this._currIndex = 0;

		this._delay = new ExclusiveTimeout();
		this._currAudio = new Audio();
		this._currAudio.autoplay = true;
		this._currAudioUrl = null;
		this._nextAudio = new Audio();
		this._nextAudio.muted = true;
		this._nextAudioUrl = null;
	}

	get isPlaying() {
		return !this._currAudio.paused || this._delay.isActive;
	}

	get isEnded() {
		return !this._conspiracy || this._currIndex >= this._conspiracy.length;
	}

	pause() {
		this._delay.cancel();
		this._currAudio.pause();
	}

	play() {
		if (this.isEnded) {
			this.conspiracy = this.getNewConspiracy();
		}
		if (!this._conspiracy) {
			return;
		}
		const src = this._conspiracy.fragments[this._currPlaying].getSoundUrl(this.wildChance);
		if (audio.src.substring(audio.src.length - src.length) !== src) {
			audio.src = src;
		}
		audio.play();

		preloadNextLine();
	}

	get currIndex() {
		return this._currIndex;
	}

	set currIndex(index) {
		if (!this._conspiracy) {
			return;
		}
		this.pause();
		this._currIndex = Math.max(0, Math.min(this._conspiracy.length, index));
		const fragment = this.currFragment();
		if (fragment) {
			const src = fragment.getSoundUrl(this.wildChance);
			if (src !== this._currAudioUrl) {
				this._currAudio =
			}
		}
	}

	get conspiracy() {
		return this._conspiracy;
	}

	set conspiracy(conspiracy) {
		if (this.isPlaying) {
			this.pause();
			this._currAudioIndex
		}
		this._conspiracy = conspiracy;
		this._currIndex = 0;
		if (conspiracy) {
			this._preloadNextFragment();
		}
	}

	currFragment(offset = 0) {
		if (this._conspiracy) {
			return this._conspiracy.fragments[this._currIndex + offset];
		} else {
			return undefined;
		}
	}

	_preloadNextFragment() {
		const nextFragment = this.currFragment(+1);
		if (!nextFragment) {
			return;
		}
		const src = nextFragment.getSoundUrl(this.getWildChance());
		if (audioPreload.src.substring(audioPreload.src.length - src.length) !== src) {
			audioPreload.src = src;
			audioPreload.load();
		}
	}
}

function randomClipDelay() {
	return randomRange(+clipDelayMin.value, +clipDelayMax.value) * 1000;
}
function randomSentenceDelay() {
	return randomRange(+sentDelayMin.value, +sentDelayMax.value) * 1000;
}

function pushText(str, index) {
	var li = document.createElement("li");
	li.appendChild(document.createTextNode(str));
	if (index >= 0) {
		li.className = "clip-text";
		li.setAttribute("index", index);
	}
	text.appendChild(li);
	return li;
}

function updateText(sentence, curr, ignoreBefore) {
	ignoreBefore |= 0;
	while (text.childElementCount > ignoreBefore) {
		text.removeChild(text.lastChild);
	}
	for (var i = ignoreBefore; i < sentence.length; ++i) {
		var clipText = getClipData(sentence[i], calm.checked, "text");
		if (!sentence[i].ignore) {
			// Capitalize, if appropriate
			var prevClip = null;
			for (var j = i - 1; j >= 0; --j) {
				if (!sentence[j].ignore) {
					prevClip = sentence[j];
					break;
				}
			}
			if (!prevClip || prevClip.end_sentence) {
				clipText = clipText[0].toUpperCase() + clipText.substring(1);
			}
			// Punctuate, if appropriate
			if (!sentence[i].pre_punctuated) {
				var nextClip = null;
				for (var j = i + 1; j < sentence.length; ++j) {
					if (!sentence[j].ignore) {
						nextClip = sentence[j];
						break;
					}
				}

				if (!nextClip || nextClip.new_sentence) {
					clipText += getClipData(sentence[i], calm.checked, "end_punctuation", ".");
				}
			}
		}
		var textItem = pushText(clipText, i);
		if (i === curr) {
			if (currText) currText.className = "clip-text";
			textItem.className = "clip-text curr";
			currText = textItem;

			preloadNextLine();
		}
	}
}

function updateSoundFile() {
	if (currText) currText.className = "clip-text";

	currText = text.children[currPlaying];
	if (currText) currText.className = "clip-text curr";

	playPause.className = "pause";
	var src = getSoundURL(sentence[currPlaying].index, calm.checked);
	if (audio.src.substring(audio.src.length - src.length) !== src) {
		audio.src = src;
	}
	audio.play();

	preloadNextLine();
}

function preloadNextLine() {
	var target = sentence[currPlaying + 1];
	if (!target) {
		return;
	}
	var src = getSoundURL(target.index, calm.checked);
	if (audioPreload.src.substring(audioPreload.src.length - src.length) !== src) {
		audioPreload.src = src;
		audioPreload.load();
	}
}

function displaySentence(sentence) {
	currPlaying = 0;
	updateText(sentence);
	updateSoundFile();
}

function startNewSentence(startedManually) {
	sentence = buildSentence(map, +asidePer.value / 100, +interPer.value / 100);
	playPause.disabled = false;
	playPause.className = "pause";
	displaySentence(sentence);

	// if (typeof gtag === "function") {
	// 	var label = "";
	// 	for (var i = 0; i < sentence.length; ++i) {
	// 		label += "/" + sentence[i].index;
	// 	}
	// 	gtag("event", startedManually ? "generate_conspiracy" : "loop_conspiracy", {
	// 		event_category: "playback",
	// 		event_label: label,
	// 	});
	// }
}

function playSound() {
	if (!sentence || currPlaying >= sentence.length) {
		startNewSentence(true);
	} else {
		updateSoundFile();

		// if (typeof gtag === "function") {
		// 	gtag("event", "resume_playback", {
		// 		event_category: "playback",
		// 	});
		// }
	}
}

function pauseSound() {
	audioDelay.cancel();

	playPause.className = "";
	audio.pause();

	// if (typeof gtag === "function") {
	// 	gtag("event", "pause_playback", {
	// 		event_category: "playback",
	// 	});
	// }
}

function stopSound() {
	if (currText) {
		currText.className = "clip-text";
		currText = null;
	}

	audioDelay.cancel();

	playPause.className = "";
	audio.pause();
}

////////////////////////////////////////////////////////
////   Actual execution   //////////////////////////////
////////////////////////////////////////////////////////

var text         = document.getElementById("text"),
	audio        = document.getElementById("audio"),
	audioPreload = document.getElementById("audio-preload"),
    start        = document.getElementById("start"),
    calm         = document.getElementById("calm"),
    loop         = document.getElementById("loop"),
    lengthW      = document.getElementById("length-weight"),
    asidePer     = document.getElementById("aside"),
    interPer     = document.getElementById("interject"),
    clipDelayMin = document.getElementById("clip-delay-min"),
    clipDelayMax = document.getElementById("clip-delay-max"),
    sentDelayMin = document.getElementById("sent-delay-min"),
	sentDelayMax = document.getElementById("sent-delay-max"),
	playPause    = document.getElementById("play-pause"),
	volume       = document.getElementById("volume"),
	firstRun     = true,
	xhr          = new XMLHttpRequest(),
	map, sentence, currPlaying, currText;
calm.onchange = function() {
	updateText(sentence, currPlaying, currPlaying + 1);
	preloadNextLine();
};
clipDelayMin.oninput = function() {
	var min = +clipDelayMin.value, max = +clipDelayMax.value;
	if (min > max) {
		clipDelayMax.value = min;
	}
};
clipDelayMax.oninput = function() {
	var min = +clipDelayMin.value, max = +clipDelayMax.value;
	if (min > max) {
		clipDelayMin.value = max;
	}
};
sentDelayMin.oninput = function() {
	var min = +sentDelayMin.value, max = +sentDelayMax.value;
	if (min > max) {
		sentDelayMax.value = min;
	}
};
sentDelayMax.oninput = function() {
	var min = +sentDelayMin.value, max = +sentDelayMax.value;
	if (min > max) {
		sentDelayMin.value = max;
	}
};
volume.oninput = function() {
	audio.volume = +volume.value;
};
audio.onended = function() {
	++currPlaying;
	if (currPlaying >= sentence.length || sentence[currPlaying].index < 0) {
		if (loop.checked) {
			audioDelay.start(startNewSentence, randomSentenceDelay());
		} else {
			stopSound();
		}
	} else {
		audioDelay.start(updateSoundFile, randomClipDelay());
	}
};
start.onclick = function() {
	audioDelay.cancel();
	startNewSentence(true);
};
playPause.onclick = function() {
	if (playPause.className === "pause") {
		pauseSound();
	} else {
		playSound();
	}
	return false;
}
text.onclick = function(e) {
	if (e.target.className.split(/\s+/g).indexOf("clip-text") >= 0) {
		var oldCurrPlaying = currPlaying;
		currPlaying = parseInt(e.target.getAttribute("index"), 10);
		audioDelay.cancel();
		audio.currentTime = 0;
		updateText(sentence, currPlaying, currPlaying);
		updateSoundFile();

		// if (typeof gtag === "function") {
		// 	gtag("event", "jump_to_clip", {
		// 		event_category: "playback",
		// 		event_label: oldCurrPlaying + ">" + currPlaying,
		// 	});
		// }
	}
}

let conspiracyBuilder;

(async function() {
	let json;
	try {
		const resp = await fetch("lines.json?v=3");
		if (!resp.ok()) {
			throw new Error(`Bad status code ${resp.status}: ${resp.statusText}`);
		}
		json = await resp.json();
	} catch (err) {
		alert(
			"Could not download the list of voice lines!\n" +
			"Check your internet connection and try reloading the page.");
		throw err;
	}
	conspiracyBuilder = new ConspiracyBuilder(json);
	start.disabled = false;
})();
