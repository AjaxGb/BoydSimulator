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

function randomClipDelay() {
	var min = +clipDelayMin.value, max = +clipDelayMax.value;
	return (min + Math.random() * (max - min)) * 1000;
}
function randomSentenceDelay() {
	var min = +sentDelayMin.value, max = +sentDelayMax.value;
	return (min + Math.random() * (max - min)) * 1000;
}

var maxLengthError = {text: "[[MAX LENGTH REACHED]]", index: -1, pre_punctuated: true };
function buildSentence(map, asideChance, interjectionChance) {
	if (asideChance >= 1 || (!firstRun && asideChance && Math.random() < asideChance)) {
		if (interjectionChance && Math.random() < interjectionChance) {
			return [randomChoice(map.interjection)];
		}
		return [randomChoice(map.aside)];
	}
	firstRun = false;
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

function getClipData(clip, sane, key, defaultValue) {
	if (!sane && clip.crazy && clip.crazy.hasOwnProperty(key)) {
		return clip.crazy[key];
	}
	if (clip.hasOwnProperty(key)) {
		return clip[key];
	}
	return defaultValue;
}

function updateText(sentence, curr, ignoreBefore) {
	ignoreBefore |= 0;
	while (text.childElementCount > ignoreBefore) {
		text.removeChild(text.lastChild);
	}
	for (var i = ignoreBefore; i < sentence.length; ++i) {
		var clipText = getClipData(sentence[i], sane.checked, "text");
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
					clipText += getClipData(sentence[i], sane.checked, "end_punctuation", ".");
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
	var src = getSoundURL(sentence[currPlaying].index, sane.checked);
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
	var src = getSoundURL(target.index, sane.checked);
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
	
	if (typeof gtag === "function") {
		var label = "";
		for (var i = 0; i < sentence.length; ++i) {
			label += "/" + sentence[i].index;
		}
		gtag("event", startedManually ? "generate_conspiracy" : "loop_conspiracy", {
			event_category: "playback",
			event_label: label,
		});
	}
}

function playSound() {
	if (!sentence || currPlaying >= sentence.length) {
		startNewSentence(true);
	} else {
		updateSoundFile();
		
		if (typeof gtag === "function") {
			gtag("event", "resume_playback", {
				event_category: "playback",
			});
		}
	}
}

function pauseSound() {
	if (timeout != undefined) {
		clearTimeout(timeout);
		timeout = undefined;
	}
	
	playPause.className = "";
	audio.pause();
	
	if (typeof gtag === "function") {
		gtag("event", "pause_playback", {
			event_category: "playback",
		});
	}
}

function stopSound() {
	if (currText) {
		currText.className = "clip-text";
		currText = null;
	}
	
	if (timeout != undefined) {
		clearTimeout(timeout);
		timeout = undefined;
	}
	
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
    sane         = document.getElementById("sane"),
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
	map, sentence, currPlaying, currText, timeout;
sane.onchange = function() {
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
			timeout = setOptionalTimeout(startNewSentence, randomSentenceDelay());
		} else {
			stopSound();
		}
	} else {
		timeout = setOptionalTimeout(updateSoundFile, randomClipDelay());
	}
};
start.onclick = function() {
	if (timeout != undefined) {
		clearTimeout(timeout);
		timeout = undefined;
	}
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
		if (timeout != undefined) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		audio.currentTime = 0;
		updateText(sentence, currPlaying, currPlaying);
		updateSoundFile();
		
		if (typeof gtag === "function") {
			gtag("event", "jump_to_clip", {
				event_category: "playback",
				event_label: oldCurrPlaying + ">" + currPlaying,
			});
		}
	}
}
document.onchange = function(e) {
	var id = e.target.id;
	
	if (id && typeof gtag === "function") {
		gtag("event", "change_setting", {
			event_category: "playback",
			event_label: id,
		});
	}
}

xhr.open("GET", "lines.json?v=3");
xhr.onload = function() {
	if (xhr.status < 200 || xhr.status >= 300) return;
	map = JSON.parse(xhr.response);
	start.disabled = false;
};
xhr.send();
