"use strict";

function randomInt(max) {
	return Math.floor(max * Math.random());
}

function randomWeightedChoice(arr, weightFunc) {
	var weights = [],
	    sum = 0;
	for (var i = arr.length - 1; i >= 0; --i) {
		var w = weightFunc(arr[i]);
		weights[i] = w;
		sum += w;
	}
	for (var i = arr.length - 1, rnd = sum * Math.random(); i >= 0; --i) {
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

function getSoundURL(i, sane) {
	return "sounds/line_" + i + (sane ? "_sane.mp3" : "_crazy.mp3");
}

function getLengthWeight(c) {
	if (!c) return 1;
	var w = 1 + (map.index[c].lengthFactor * (+lengthW.value));
	return (w < 0) ? 0 : w;
}

var maxLengthError = {text: "[[MAX LENGTH REACHED]]", index: -1};
function buildSentence(map, asideChance, interjectionChance) {
	if (!firstRun && asideChance && Math.random() < asideChance) {
		if (interjectionChance && Math.random() < interjectionChance) {
			return [randomChoice(map.interjection)];
		}
		return [randomChoice(map.aside)];
	}
	firstRun = false; // Make sure we don't start with an aside.
	var result = [];
	for (
			var curr = "subject";
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
					var tempChance = interjectionChance;
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
	var li = document.createElement("li");
	li.appendChild(new Text(str));
	text.appendChild(li);
	return li;
}

function updateText(sentence, curr, ignoreBefore) {
	ignoreBefore |= 0;
	while (text.childElementCount > ignoreBefore) {
		text.removeChild(text.lastChild);
	}
	for (var i = ignoreBefore; i < sentence.length; ++i) {
		var textItem = pushText(sane.checked
			? sentence[i].text
			: sentence[i].crazy || sentence[i].text);
		if (i === curr) {
			if (currText) currText.className = "";
			textItem.className = "curr";
			currText = textItem;
			preloader.src = getSoundURL(sentence[i].index + 1, sane.checked);
		}
	}
}

function displaySentence(sentence) {
	currPlaying = 0;
	updateText(sentence);
	updateSoundFile();
}

function updateSoundFile() {
	if (currText) currText.className = "";
	currText = null;
	
	currText = text.children[currPlaying];
	if (currText) currText.className = "curr";
	
	audio.src = getSoundURL(sentence[currPlaying].index, sane.checked);
	preloader.src = getSoundURL(sentence[currPlaying].index + 1, sane.checked);
}

function startNewSentence(argument) {
	sentence = buildSentence(map, +aside.value, +inter.value);
	stopped = false;
	start.value = "Stop";
	displaySentence(sentence);
}

function stopSound() {
	if (currText) currText.className = "";
	currText = null;
	
	audio.pause();
	stopped = true;
	start.value = "Generate Conspiracy";
}

////////////////////////////////////////////////////////
////   Actual execution   //////////////////////////////
////////////////////////////////////////////////////////

var text      = document.getElementById("text"),
    audio     = document.getElementById("audio"),
    start     = document.getElementById("start"),
    sane      = document.getElementById("sane"),
    loop      = document.getElementById("loop"),
    lengthW   = document.getElementById("lengthWeight"),
    aside     = document.getElementById("aside"),
    inter     = document.getElementById("interject"),
    delay     = document.getElementById("delay"),
    vol       = document.getElementById("volume"),
    volO      = document.getElementById("volumeOut"),
    load      = document.getElementById("load"),
    preloader = document.getElementById("preloader"),
    xhr       = new XMLHttpRequest(),
    firstRun  = true,
    stopped   = true,
    voices    = [],
    map, sentence, currPlaying, currText, timeout;
sane.onchange = function() {
	updateText(sentence, currPlaying, currPlaying + 1);	
};
vol.oninput = function() {
	var v = +vol.value;
	audio.volume = v;
	volO.innerHTML = (v * 100)|0;
};
load.onclick = function() {
	for (var i = 1; i <= 202; ++i) {
		new Audio(getSoundURL(i, true));
		new Audio(getSoundURL(i, false));
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
