"use strict";

function random(max) {
	return Math.floor(max * Math.random());
}

function randomChoice(arr) {
	return arr[random(arr.length)];
};

function indexToSoundFile(i, sane) {
	const line = voices[i];
	if (!line) return undefined;
	return line[sane ? "sane" : "crazy"] || line[sane ? "crazy" : "sane"];
}

function buildSentence(map, asideChance, interjectionChance) {
	if (asideChance && Math.random() < asideChance) {
		if (interjectionChance && Math.random() < interjectionChance) {
			return [randomChoice(map.interjection)];
		}
		return [randomChoice(map.aside)];
	}
	const result = [];
	for (let curr = "subject"; curr !== null; curr = randomChoice(map[curr].next)) {
		if (result.length >= 1000) return result;
		result.push(randomChoice(map[curr].entries));
		if (interjectionChance) {
			// Decrease chance by half each time, to discourage long strings
			// of interjections.
			for (let tempChance = interjectionChance; Math.random() < tempChance; tempChance /= 2) {
				if (result.length >= 1000) return result;
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
			if (!stopped) start.onclick();
			return;
		}
	}
	audio.src = src;
}

////////////////////////////////////////////////////////
////   Actual execution   //////////////////////////////
////////////////////////////////////////////////////////

const text  = document.getElementById("text"),
      audio = document.getElementById("audio"),
      start = document.getElementById("start"),
      sane  = document.getElementById("sane"),
      loop  = document.getElementById("loop"),
      aside = document.getElementById("aside"),
      inter = document.getElementById("interject"),
      files = document.getElementById("files"),
      xhr   = new XMLHttpRequest(),
      numRx = /^\D*(\d+)\D*(?:\.[^.]*)?$/;
let stopped = true, map, voices = [], sentence, currPlaying;
sane.onchange = function() {
	updateText(sentence, currPlaying + 1);	
};
files.onchange = function() {
	if (!stopped) start.onclick();
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
			start.onclick();
			if (loop.checked) start.onclick();
		}
		return;
	}
	updateSoundFile();
};
start.onclick = function() {
	if (stopped) {
		sentence = buildSentence(map, +aside.value, +inter.value);
		stopped = false;
		start.value = "Stop";
		displaySentence(sentence);
	} else {
		audio.pause();
		stopped = true;
		start.value = "Start";
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
