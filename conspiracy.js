"use strict";

function random(max) {
	return Math.floor(max * Math.random());
}

function randomChoice(arr) {
	return arr[random(arr.length)];
};

function indexToSoundFile(i, sane) {
	i += "";
	return "sounds/ASBR" + "00".substring(0, 3 - i.length) + i
		+ "BO" + (sane ? "B" : "A") + ".wav";
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

function updateText(sentence, ignoreBefore) {
	ignoreBefore |= 0
	while (text.childElementCount > ignoreBefore) {
		text.removeChild(text.lastChild);
	}
	for (let i = ignoreBefore; i < sentence.length; ++i) {
		const li = document.createElement("li");
		li.appendChild(new Text(
			sane.checked
			? sentence[i].text
			: sentence[i].crazy || sentence[i].text));
		text.appendChild(li);
	}
}

function displaySentence(sentence) {
	updateText(sentence);
	currPlaying = 0;
	audio.onended = function() {
		if (++currPlaying >= sentence.length) {
			start.onclick();
			if(loop.checked) start.onclick();
			return;
		}
		audio.src = indexToSoundFile(sentence[currPlaying].index, sane.checked);
	}
	audio.src = indexToSoundFile(sentence[0].index, sane.checked);
}

////////////////////////////////////////////////////////
////   Actual execution   //////////////////////////////
////////////////////////////////////////////////////////

const text  = document.getElementById("text"),
      audio = document.getElementById("audio"),
      start = document.getElementById("start"),
      sane  = document.getElementById("sane"),
      loop  = document.getElementById("loop"),
      aside  = document.getElementById("aside"),
      inter  = document.getElementById("interject"),
      xhr = new XMLHttpRequest();
let stopped = true, map, sentence, currPlaying;
sane.onchange = function() {
	updateText(sentence, currPlaying + 1);	
};
start.onclick = function() {
	if (stopped) {
		sentence = buildSentence(map, +aside.value, +inter.value);
		displaySentence(sentence);
		stopped = false;
		start.value = "Stop";
	} else {
		audio.pause();
		stopped = true;
		start.value = "Start";
	}
};

xhr.open("GET", "sounds/_map.json");
xhr.responseType = "json";
xhr.onload = function() {
	map = xhr.response;
	start.disabled = false;
};
xhr.send();
