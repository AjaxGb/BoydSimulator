"use strict";

function randomInt(max) {
	return Math.floor(max * Math.random());
}

function randomWeightedChoice(arr, weightFunc) {
	const weights = [];
	let sum = 0;
	for (let i = arr.length - 1; i >= 0; --i) {
		const w = weightFunc(arr[i]);
		weights[i] = w;
		sum += w;
	}
	for (let i = arr.length - 1, rnd = sum * Math.random(); i >= 0; --i) {
		rnd -= weights[i];
		if (rnd < 0) return arr[i];
	}
	// Shouldn't get here, but floats being what they are...
	return arr[0];
}

function randomChoice(arr) {
	return arr[randomInt(arr.length)];
}

function setOptionalTimeout(func, delay) {
	if (delay === 0) {
		func();
	} else {
		return setTimeout(func, delay);
	}
}

function indexToSoundFile(i, sane) {
	const line = voices[i];
	if (!line) return undefined;
	return line[sane ? "sane" : "crazy"] || line[sane ? "crazy" : "sane"];
}

function getLengthWeight(c) {
	if (!c) return 1;
	const w = 1 + (map.index[c].lengthFactor * (+lenF.value));
	return (w < 0) ? 0 : w;
}

const maxLengthError = {text: "[[MAX LENGTH REACHED]]", index: -1};
function buildSentence(map, asideChance, interjectionChance) {
	if (asideChance && Math.random() < asideChance) {
		if (interjectionChance && Math.random() < interjectionChance) {
			return [randomChoice(map.interjection)];
		}
		return [randomChoice(map.aside)];
	}
	const result = [];
	for (
			let curr = "subject";
			curr !== null;
			curr = randomWeightedChoice(map.index[curr].next, getLengthWeight)
		) {
		if (result.length >= 1000) {
			result.push(maxLengthError)
			return result;
		}
		result.push(randomChoice(map[curr]));
		if (interjectionChance) {
			// Decrease chance by half each time, to discourage long strings
			// of interjections.
			for (
					let tempChance = interjectionChance;
					Math.random() < tempChance;
					tempChance /= 2
				) {
				if (result.length >= 1000) {
					result.push(maxLengthError)
					return result;
				}
				result.push(randomChoice(map.interjection));
			}
		}
	}
	return result;
}

function pushText(str) {
	const li = document.createElement("li");
	li.appendChild(new Text(str));
	text.appendChild(li);
}

function updateText(sentence, ignoreBefore) {
	ignoreBefore |= 0
	while (text.childElementCount > ignoreBefore) {
		text.removeChild(text.lastChild);
	}
	for (let i = ignoreBefore; i < sentence.length; ++i) {
		pushText(sane.checked
			? sentence[i].text
			: sentence[i].crazy || sentence[i].text);
	}
}

function displaySentence(sentence) {
	updateText(sentence);
	currPlaying = 0;
	updateSoundFile();
}

function updateSoundFile() {
	let src;
	while(1) {
		src = indexToSoundFile(sentence[currPlaying].index, sane.checked);
		if (src) break;
		if (++currPlaying >= sentence.length) {
			stopSound();
			return;
		}
	}
	audio.src = src;
}

function startNewSentence(argument) {
	sentence = buildSentence(map, +aside.value, +inter.value);
	stopped = false;
	start.value = "Stop";
	displaySentence(sentence);
}

function stopSound() {
	audio.pause();
	stopped = true;
	start.value = "Generate Conspiracy";
}

////////////////////////////////////////////////////////
////   Actual execution   //////////////////////////////
////////////////////////////////////////////////////////

const text  = document.getElementById("text"),
      audio = document.getElementById("audio"),
      start = document.getElementById("start"),
      sane  = document.getElementById("sane"),
      loop  = document.getElementById("loop"),
      lenF  = document.getElementById("lengthWeight"),
      aside = document.getElementById("aside"),
      inter = document.getElementById("interject"),
      delay = document.getElementById("delay"),
      vol   = document.getElementById("volume"),
      volO  = document.getElementById("volumeOut"),
      files = document.getElementById("files"),
      xhr   = new XMLHttpRequest(),
      numRx = /^\D*(\d+)\D*(?:\.[^.]*)?$/;
let stopped = true, map, voices = [], sentence, currPlaying, timeout;
sane.onchange = function() {
	updateText(sentence, currPlaying + 1);	
};
vol.oninput = function() {
	const v = +vol.value;
	audio.volume = v;
	volO.innerHTML = (v * 100)|0;
};
files.onchange = function() {
	stopSound();
	for (let i = voices.length - 1; i >= 0; --i) {
		for (let j in voices[i]) {
			URL.revokeObjectURL(voices[i][j]);
		}
		voices[i] = undefined;
	}
	let filled = 0;
	updateText([]);
	pushText("Loading files...");
	for (var i = 0; i < files.files.length; ++i) {
		const file = files.files[i],
		      lastDot = file.name.lastIndexOf('.'),
		      numMatch = numRx.exec(file.name);
		if (!numMatch) {
			pushText('ERROR: "' + file.name
				+ '" contains too many or too few numbers! It must contain one.');
			pushText('Skipping "' + file.name + '".');
			continue;
		}
		if (lastDot < 0) lastDot = file.name.length;
		const index = numMatch[1]|0;
		let variant = file.name.toUpperCase()[lastDot - 1];
		if (index < 1 || index > 202) {
			pushText("ERROR: Index " + index + ' in "' + file.name
				+ '" is outside of the range 1-202.');
			pushText('Skipping "' + file.name + '".');
			continue;
		}
		if (variant === "A") {
			variant = "crazy";
		} else if (variant === "B") {
			variant = "sane";
		} else {
			pushText("ERROR: '" + variant + "' at the end of \"" + file.name
				+ "\" is neither 'A' nor 'B'.");
			pushText('Skipping "' + file.name + '".');
			continue;
		}
		if (!voices[index]) {
			voices[index] = {};
			++filled;
		} else if (variant in voices[index]) {
			pushText('ERROR: "' + file.name
				+ '" has the same index and variant as another file.');
			pushText('Skipping "' + file.name + '".');
			continue;
		}
		
		voices[index][variant] = URL.createObjectURL(file);
	}
	if (filled < 202) {
		pushText("WARNING: " + (202 - filled)
			+ " indices were never filled. Those lines will be silent.");
		pushText("Loaded " + filled + " lines.");
	} else {
		pushText("Loaded all " + filled + " lines.");
	}
};
audio.onended = function() {
	if (++currPlaying >= sentence.length) {
		if (!stopped) {
			if (loop.checked) {
				timeout = setOptionalTimeout(startNewSentence,
					+delay.value * 1000);
			} else {
				stopSound();
			}
		}
		return;
	}
	timeout = setOptionalTimeout(updateSoundFile, +delay.value * 1000);
};
start.onclick = function() {
	if (timeout != undefined) {
		clearTimeout(timeout);
		timeout = undefined;
	}
	if (stopped) {
		startNewSentence();
	} else {
		stopSound();
	}
};

xhr.open("GET", "lines.json");
xhr.responseType = "json";
xhr.onload = function() {
	if (xhr.status < 200 || xhr.status >= 300) return;
	map = xhr.response;
	start.disabled = false;
};
xhr.send();
