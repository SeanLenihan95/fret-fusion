// CLASSES //

class Timer {
  constructor(timeInterval) {
    this.timeInterval = timeInterval;
    this.running = false;
    this.timeoutId;
    this.expected;
  }

  start() {
    this.performAction(); // perform the first action without a delay
    this.running = true;
    this.expected = Date.now() + this.timeInterval;
    this.timeoutId = setTimeout(this.run, this.timeInterval, this);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timeoutId);
    controller.toggleElementsDuringRuntime();
  }

  performAction() {}

  run(obj) {
    // can't use "this" with recursive calls, have to pass reference to Timer object ("obj") instead
    var drift = Date.now() - obj.expected; // calculate how "off" Date.now() is from expected time, and save to drift variable

    // perform an action
    obj.performAction();

    // calculate the expected time point for the next recursive call
    obj.expected += obj.timeInterval;

    // use setTimeout to recursively call run() function with newly calculated time interval
    obj.timeoutId = setTimeout(obj.run, obj.timeInterval - drift, obj);
  }

  setTimeInterval(timeInterval) {
    this.timeInterval = timeInterval;
  }

  updateTimeInterval() {
    this.setTimeInterval(60000 / controller.getAttribute("tempo") / controller.getAttribute("noteValue"));
  }
}

class ScalePlayer extends Timer {
  constructor() {
    super(60000 / controller.getAttribute("tempo") / controller.getAttribute("noteValue"));

    this.key = controller.getAttribute("key");
    this.hearMetronome = controller.getAttribute("hearMetronome");

    this.currentNote = 0;
    this.reverse = false;
    this.count = 0;
  }

  mapScale(scale) {
    function checkScaleWidth(fretNumber) {
      if (fretNumber + scale.rightmostNote <= fretboardLength && fretNumber - scale.leftmostNote >= 0) {
        return fretNumber;
      }
    }

    var firstStringFrets = Array.from(fb.strings[0].children);
    if (fb.getAttribute("leftHanded")) {
      firstStringFrets.reverse();
    }

    var currentIndex = 0;
    var startingPosition;
    var fretboardLength = fb.getAttribute("fretboardLength");

    while (startingPosition == undefined && currentIndex < firstStringFrets.length) {
      var currentFret = firstStringFrets[currentIndex];

      // key note found
      if (currentFret.getAttribute("note").startsWith(this.key + "-")) {
        if (currentIndex + scale.distanceFromRootRight <= fretboardLength) {
          startingPosition = checkScaleWidth(currentIndex + scale.distanceFromRootRight);
        }
        if (startingPosition == undefined && currentIndex - scale.distanceFromRootLeft >= 0) {
          startingPosition = checkScaleWidth(currentIndex - scale.distanceFromRootLeft);
        }
      }
      currentIndex++;
    }

    if (startingPosition == undefined) {
      alert("Not enough frets");
      return;
    }

    var fretsToPlay = [];
    var strings = fb.strings;
    var currentString = strings[0];

    scale.notes.forEach((intervals) => {
      intervals.forEach((interval) => {
        if (fb.getAttribute("leftHanded")) {
          var fretToPlay = Array.from(currentString.children).reverse()[startingPosition + interval];
        } else {
          var fretToPlay = currentString.children[startingPosition + interval];
        }
        fretsToPlay.push(fretToPlay);
      });
      currentString = strings[strings.indexOf(currentString) + 1];
    });

    return fretsToPlay;
  }

  start() {
    var nameOfScale = controller.getAttribute("scale");
    var position = controller.getAttribute("position");
    var instrument = fb.getAttribute("instrument");
    this.scale = this.mapScale(controller.getScale(instrument, nameOfScale, position));
    controller.toggleElementsDuringRuntime();

    if (!this.scale) {
      this.stop();
      document.getElementById("play-scale-btn").innerText = "Play scale";
      document.getElementById("play-scale-btn").disabled = false;
    } else {
      super.start();
    }
  }

  performAction() {
    fb.playNote(this.scale[this.currentNote], this.timeInterval);

    // last note of scale played, switch direction to reverse
    if (this.currentNote == this.scale.length - 1) {
      this.reverse = true;
      // first note of scale played, switch direction to forwards
    } else if (this.currentNote == 0) {
      this.reverse = false;
    }

    // update currentNote
    if (this.reverse) {
      this.currentNote--;
    } else {
      this.currentNote++;
    }

    if (this.hearMetronome && this.count % controller.getAttribute("noteValue") == 0) {
      if (this.count % (controller.getAttribute("noteValue") * 4) == 0) {
        controller.playAudioBuffer("accented-click");
      } else {
        controller.playAudioBuffer("normal-click");
      }
    }
    this.count++;
  }

  setHearMetronome(hearMetronome) {
    this.hearMetronome = hearMetronome;
  }
}

class Recorder extends Timer {
  constructor() {
    super(60000 / controller.getAttribute("tempo") / controller.getAttribute("noteValue"));

    this.toPlay = [];
    this.currentIndex = 0;
    this.quantised = controller.getAttribute("quantised");
    this.quantisedTimeInterval = this.timeInterval;
    this.isRecording = false;
    this.endTime;

    this.listenForFretClick = (event) => {
      this.toPlay.push([event.target, Date.now()]);
    };
  }

  start() {
    controller.toggleElementsDuringRuntime();
    super.start();
  }

  startRecording() {
    Array.from(fb.frets).forEach((fret) => {
      fret.addEventListener("click", this.listenForFretClick);
    });
    this.isRecording = true;
  }

  stopRecording() {
    this.endTime = Date.now();
    Array.from(fb.frets).forEach((fret) => {
      fret.removeEventListener("click", this.listenForFretClick);
    });
    this.isRecording = false;
  }

  performAction() {
    var duration;
    if (!this.quantised) {
      if (this.currentIndex == this.toPlay.length - 1) {
        duration = this.endTime - this.toPlay[this.currentIndex][1];
      } else {
        duration = this.toPlay[this.currentIndex + 1][1] - this.toPlay[this.currentIndex][1];
      }
    } else {
      duration = this.quantisedTimeInterval;
    }

    fb.playNote(this.toPlay[this.currentIndex][0], duration);

    // retain a reference to currentIndex and update currentIndex to next position in toPlay
    var previousIndex = this.currentIndex;
    this.currentIndex = (this.currentIndex + 1) % this.toPlay.length;

    if (!this.quantised) {
      if (previousIndex == this.toPlay.length - 1) {
        this.setTimeInterval(this.endTime - this.toPlay[previousIndex][1]);
      } else {
        this.setTimeInterval(this.toPlay[this.currentIndex][1] - this.toPlay[previousIndex][1]);
      }
    }
  }

  setQuantised(quantised) {
    this.quantised = quantised;
    this.setTimeInterval(this.quantisedTimeInterval);
  }

  hasRecording() {
    return !this.toPlay.length == 0;
  }

  deleteRecording() {
    this.toPlay = [];
  }

  updateTimeInterval() {
    this.quantisedTimeInterval = 60000 / controller.getAttribute("tempo") / controller.getAttribute("noteValue");
    if (this.quantised) {
      this.setTimeInterval(this.quantisedTimeInterval);
    }
  }
}

class IntervalTrainer {
  constructor() {
    this.string = Array.from(fb.strings[this.getRandomInt(0, fb.strings.length - 1)].children);
    this.baseFret = this.string[this.getRandomInt(0, this.string.length - 1)];
    this.allFrets = fb.frets;
    this.fretToGuess;
    this.interval;
    this.guessedFret;
    this.running;

    // select a random fret within 8 notes of base fret
    while (this.fretToGuess == undefined || this.fretToGuess == this.baseFret) {
      this.interval = this.getRandomInt(-8, 8);
      this.fretToGuess = this.string[this.string.indexOf(this.baseFret) + this.interval];
    }

    // event listener to add to all frets
    this.listenForGuess = (event) => {
      this.guessedFret = event.target;
      if (this.guessedFret.getAttribute("note") == this.fretToGuess.getAttribute("note")) {
        this.fretToGuess = this.guessedFret;
        this.correct();
        this.stop();
      }
    };
  }

  start() {
    this.running = true;
    controller.toggleElementsDuringRuntime();

    // play base fret note
    controller.playAudioBuffer(this.baseFret.getAttribute("note"));
    fb.highlightFret(this.baseFret, "hovered");

    // play fret to guess after 1.5 seconds
    setTimeout(() => {
      controller.playAudioBuffer(this.fretToGuess.getAttribute("note"));
    }, 1500);

    this.allFrets.forEach((fret) => {
      fret.addEventListener("click", this.listenForGuess);
    });
  }

  stop() {
    fb.unhighlightFret(this.baseFret);
    this.allFrets.forEach((fret) => {
      fret.removeEventListener("click", this.listenForGuess);
      fret.classList.remove("hovered");
    });

    this.running = false;
    controller.toggleElementsDuringRuntime();
    document.getElementById("interval-btn").disabled = false;
    document.getElementById("interval-btn").innerText = "Start interval training";
  }

  correct() {
    var fretsToHighlight = [this.baseFret, this.fretToGuess];
    fretsToHighlight.forEach((fret) => {
      fb.highlightFret(fret, "correct");

      setTimeout(() => {
        fb.unhighlightFret(fret, "correct");
        fb.unhighlightFret(fret, "hovered");
      }, 1500);
    });
  }

  getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

class Controller {
  constructor() {
    this.audioBuffers = {};
    this.ctx = new AudioContext();

    this.attributes = {
      tempo: 70,
      noteValue: 4,
      hearMetronome: true,
      key: "A",
      scale: "major",
      position: 1,
      quantised: false,
    };

    this.baseUrl = "https://s3.eu-west-2.amazonaws.com/fretfusion.com";

    this.initialiseAudioBuffers();
    this.initialiseScales();
    this.addEventListeners();
  }

  initialiseScales() {
    fetch(this.baseUrl + "/scales.json")
    // fetch("./scales.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("The returned HTTP status code indicates an error.");
        }
        return response.json();
      })
      .then((json) => {
        this.scales = json;
      })
      .catch((error) => {
        console.error("Fetch error:", error);
      });
  }

  getScale(instrument, nameOfScale, position) {
    return this.scales[instrument][nameOfScale][position];
  }

  getStandardTuning(instrument) {
    const standardTunings = {
      sixStringGuitar: ["E-1", "A-1", "D-1", "G-2", "B-2", "E-3"],
      sevenStringGuitar: ["B-0", "E-1", "A-1", "D-1", "G-2", "B-2", "E-3"],
      fiveStringBass: ["B-0", "E-1", "A-1", "D-1", "G-2"],
      fourStringBass: ["E-1", "A-1", "D-1", "G-2"],
      ukulele: ["G-1", "C-1", "E-2", "A-2"],
    };
    return standardTunings[instrument];
  }

  convertTuning(degree) {
    const noteNames = ["E", "F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb"];

    var standard = this.getStandardTuning(fb.getAttribute("instrument"));
    var newTuning = [];
    standard.forEach((note) => {
      var octave = note.slice(note.indexOf("-") + 1);
      note = note.slice(0, note.indexOf("-"));
      var indexOfNewNote = (noteNames.indexOf(note) + degree) % noteNames.length;

      // update octave if necessary
      if (indexOfNewNote < 0) {
        indexOfNewNote = indexOfNewNote + noteNames.length;
        octave--;
      }
      if (noteNames.indexOf(note) + degree >= noteNames.length) {
        octave++;
        console.log("octave increased");
      }

      note = noteNames[indexOfNewNote];
      newTuning.push(note + "-" + octave);
    });
    return newTuning;
  }

  resizeFretboardByViewport() {
    fb.fretboardElement.replaceChildren();
    fb.strings = [];
    var viewportWidth = window.innerWidth;
    var maxFretboardLength;

    if (viewportWidth > 1520) {
      maxFretboardLength = 24;
    } else if (viewportWidth > 1290) {
      maxFretboardLength = 20;
    } else if (viewportWidth > 800) {
      maxFretboardLength = 12;
    } else if (viewportWidth > 700) {
      maxFretboardLength = 10;
    } else if (viewportWidth > 580) {
      maxFretboardLength = 8;
    } else if (viewportWidth > 460) {
      maxFretboardLength = 6;
    } else if (viewportWidth > 460) {
      maxFretboardLength = 4;
    } else {
      maxFretboardLength = 3;
    }

    if (viewportWidth <= 1200) {
      fb.setAttribute("fretboardLength", maxFretboardLength);
      document.getElementById("fretboard-length-switch").value = maxFretboardLength;
    }
    document.getElementById("fretboard-length-switch").setAttribute("max", maxFretboardLength);

    fb.render();
  }

  addEventListeners() {
    // input number min/max
    var inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach((input) => {
      input.addEventListener("change", (event) => {
        var target = event.target;
        var value = parseInt(target.value);
        if (value > target.max) {
          target.value = target.max;
          alert("Sorry, this value exceeds the maximum input allowed.");
        } else if (value < target.min) {
          target.value = target.min;
          alert("Sorry, this value is below the minimum input allowed.");
        }
      });
    });
    // instrument
    var instrumentOptions = Array.from(document.getElementById("instrument-options").children);
    instrumentOptions.forEach((instrumentOption) => {
      instrumentOption.addEventListener("click", (event) => {
        console.log("event");
        fb.setAttribute("instrument", event.target.getAttribute("data-custom-value"));
      });
    });
    // tuning
    var tuningOptions = Array.from(document.getElementById("tuning-options").children);
    tuningOptions.forEach((tuningOption) => {
      tuningOption.addEventListener("click", (event) => {
        var degree = parseInt(event.target.getAttribute("data-custom-value"));
        var tuning = this.convertTuning(degree);
        fb.setAttribute("tuning", tuning);
      });
    });
    // fretboard length
    document.getElementById("fretboard-length-switch").addEventListener("change", (event) => {
      console.log("event fired");
      fb.setAttribute("fretboardLength", event.target.value);
    });
    // lefthanded
    document.getElementById("left-handed-mode-switch").addEventListener("change", (event) => {
      fb.setAttribute("leftHanded", event.target.checked);
    });
    // show flats
    document.getElementById("show-flats-switch").addEventListener("change", (event) => {
      console.log(event.target);
      fb.setAttribute("showFlats", event.target.checked);
    });
    // tempo
    document.getElementById("tempo-switch").addEventListener("change", (event) => {
      var newTempo = parseInt(event.target.value);
      this.setAttribute("tempo", newTempo);

      [scalePlayer, recorder].forEach((timer) => {
        if (timer) {
          timer.updateTimeInterval();
        }
      });
    });
    // note value
    var noteValueOptions = Array.from(document.getElementById("note-value-options").children);
    noteValueOptions.forEach((noteValueOption) => {
      noteValueOption.addEventListener("click", (event) => {
        var newNoteValue = parseInt(event.target.getAttribute("data-custom-value"));
        this.setAttribute("noteValue", newNoteValue);

        [scalePlayer, recorder].forEach((timer) => {
          if (timer && timer.running) {
            timer.updateTimeInterval();
          }
        });
      });
    });
    // scale
    var scaleOptions = Array.from(document.getElementById("scale-options").children);
    scaleOptions.forEach((scaleOption) => {
      scaleOption.addEventListener("click", (event) => {
        this.setAttribute("scale", event.target.getAttribute("data-custom-value"));

        // stop and restart scalePlayer with new scale if it is already playing
        if (scalePlayer && scalePlayer.running) {
          scalePlayer.stop();
          scalePlayer = new ScalePlayer();
          scalePlayer.start();
        }
      });
    });
    // key
    var keyOptions = Array.from(document.getElementById("key-options").children);
    keyOptions.forEach((keyOption) => {
      keyOption.addEventListener("click", (event) => {
        this.setAttribute("key", event.target.getAttribute("data-custom-value"));

        // stop and restart scalePlayer with new scale if it is already playing
        if (scalePlayer && scalePlayer.running) {
          scalePlayer.stop();
          scalePlayer = new ScalePlayer();
          scalePlayer.start();
        }
      });
    });
    // position
    var positionOptions = Array.from(document.getElementById("position-options").children);
    positionOptions.forEach((positionOption) => {
      positionOption.addEventListener("click", (event) => {
        this.setAttribute("position", event.target.getAttribute("data-custom-value"));

        // stop and restart scalePlayer with new scale if it is already playing
        if (scalePlayer && scalePlayer.running) {
          scalePlayer.stop();
          scalePlayer = new ScalePlayer();
          scalePlayer.start();
        }
      });
    });
    // hear metronome
    document.getElementById("hear-metronome-switch").addEventListener("change", (event) => {
      this.setAttribute("hearMetronome", event.target.checked);
      if (scalePlayer && scalePlayer.running) {
        scalePlayer.setHearMetronome(event.target.checked);
      }
    });
    // quantise recording
    document.getElementById("quantise-recording-switch").addEventListener("change", (event) => {
      if (recorder) {
        recorder.setQuantised(event.target.checked);
      }
      this.setAttribute("quantised", event.target.checked);
    });
    // start/stop scale
    var playScaleBtn = document.getElementById("play-scale-btn");
    playScaleBtn.addEventListener("click", () => {
      if (scalePlayer && scalePlayer.running) {
        scalePlayer.stop();

        playScaleBtn.disabled = false;
        playScaleBtn.innerText = "Play scale";
      } else {
        scalePlayer = new ScalePlayer();
        scalePlayer.start();

        if (scalePlayer.running) {
          playScaleBtn.disabled = false;
          playScaleBtn.innerText = "Stop scale";
        }
      }
    });
    // start/stop interval training
    var intervalTrainerBtn = document.getElementById("interval-btn");
    intervalTrainerBtn.addEventListener("click", () => {
      if (intervalTrainer && intervalTrainer.running) {
        intervalTrainer.stop();

        intervalTrainerBtn.disabled = false;
        intervalTrainerBtn.innerText = "Start interval training";
      } else {
        intervalTrainer = new IntervalTrainer();
        intervalTrainer.start();

        intervalTrainerBtn.disabled = false;
        intervalTrainerBtn.innerText = "Stop interval training";
      }
    });
    // start/stop recording
    var recordBtn = document.getElementById("record-btn");
    recordBtn.addEventListener("click", () => {
      if (recorder && recorder.isRecording) {
        recorder.stopRecording();

        this.toggleElementsDuringRuntime();
        recordBtn.disabled = false;
        recordBtn.innerText = "Start recording";
      } else {
        recorder = new Recorder();
        recorder.startRecording();

        this.toggleElementsDuringRuntime();
        recordBtn.disabled = false;
        recordBtn.innerText = "Stop recording";
      }
    });
    // play/stop playing recording
    var playRecordingBtn = document.getElementById("play-recording-btn");
    playRecordingBtn.addEventListener("click", () => {
      if (recorder && !recorder.running && recorder.hasRecording()) {
        recorder.start();

        playRecordingBtn.disabled = false;
        playRecordingBtn.innerText = "Stop playback";
      } else if (recorder && recorder.running) {
        recorder.stop();

        playRecordingBtn.disabled = false;
        playRecordingBtn.innerText = "Play recording";
      } else {
        alert("Please record something first");
      }
    });
    // toggle dark mode
    document.getElementById("dark-mode-switch").addEventListener("change", () => {
      this.toggleColourMode();
    });
    // selected style to li elements
    var selectableElements = Array.from(document.getElementsByClassName("selectable"));
    selectableElements.forEach((selectableElement) => {
      selectableElement.addEventListener("click", (event) => {
        var siblingselectableElements = Array.from(event.target.parentNode.children);
        siblingselectableElements.forEach((siblingselectableElement) => {
          siblingselectableElement.classList.remove("selected-li");
        });
        event.target.classList.add("selected-li");
      });
    });
    // change freboard based on viewport
    window.addEventListener("resize", this.resizeFretboardByViewport);
    window.addEventListener("load", this.resizeFretboardByViewport);
  }

  initialiseAudioBuffers() {
    var filesToFetch = ["normal-click", "accented-click", "E-5", "F-5", "Gb-5"];

    ["E", "F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb"].forEach((noteName) => {
      for (let octave = 0; octave < 5; octave++) {
        filesToFetch.push(noteName + "-" + octave);
      }
    });

    filesToFetch.forEach((file) => {
      var url = this.baseUrl + "/notes/" + file + ".wav";
      fetch(url)
        .then((data) => {
          if (!data.ok) {
            throw new Error("The returned HTTP status code indicates an error");
          }
          return data.arrayBuffer();
        })
        .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
        .then((decodedAudio) => {
          this.audioBuffers[file] = decodedAudio;
        })
        .catch((error) => {
          console.error("Error fetching or decoding " + url, error);
        });
    });
  }

  playAudioBuffer(audio) {
    var audioBuffer = this.audioBuffers[audio];
    var playSound = this.ctx.createBufferSource();
    playSound.buffer = audioBuffer;
    playSound.connect(this.ctx.destination);
    playSound.start(this.ctx.currentTime);
  }

  setGlobalCssVariable(property, value) {
    document.documentElement.style.setProperty(property, value);
  }

  toggleElementsDuringRuntime() {
    Array.from(document.getElementsByClassName("disabled-during-runtime")).forEach((element) => {
      if (element.nodeName == "LI") {
        element.style.pointerEvents = element.style.pointerEvents == "none" ? "auto" : "none";
      } else {
        element.disabled = !element.disabled;
      }
    });
  }

  toggleColourMode() {
    var colourA = getComputedStyle(document.documentElement).getPropertyValue("--colour-a");
    var colourB = getComputedStyle(document.documentElement).getPropertyValue("--colour-b");
    this.setGlobalCssVariable("--colour-a", colourB);
    this.setGlobalCssVariable("--colour-b", colourA);

    if (document.getElementById("dark-mode-switch").checked) {
      document.getElementById("nav").classList.add("navbar-dark");
    } else {
      document.getElementById("nav").classList.remove("navbar-dark");
    }
  }

  getAttribute(attribute) {
    return this.attributes[attribute];
  }

  setAttribute(attribute, value) {
    this.attributes[attribute] = value;
  }
}

class Fretboard {
  constructor() {
    this.attributes = {
      instrument: "sixStringGuitar",
      tuning: ["E-1", "A-1", "D-1", "G-2", "B-2", "E-3"],
      fretboardLength: 12,
      leftHanded: false,
      showFlats: false,
    };

    this.fretboardElement = document.getElementById("fretboard");
    this.strings = [];
    this.frets = new Set();
  }

  render() {
    function calculateNote(startingNote, fretNumber) {
      // get note name and octave from startingNote
      var startingNoteName = startingNote.slice(0, startingNote.indexOf("-"));
      var startingOctave = parseInt(startingNote.slice(startingNote.indexOf("-") + 1));

      var fretNoteName = noteNames[(noteNames.indexOf(startingNoteName) + fretNumber) % 12];

      var fretOctave = startingOctave + Math.trunc((noteNames.indexOf(startingNoteName) + fretNumber) / 12);

      return fretNoteName + "-" + fretOctave;
    }

    const markedFretsSingle = [3, 5, 7, 9, 14, 16, 18, 20, 22];
    const markedFretsDouble = [12, 24];
    const noteNames = ["E", "F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb"];
    var numberOfStrings = this.getAttribute("tuning").length;
    var numberOfFrets = this.getAttribute("fretboardLength");

    // reset fretboard element and strings array
    this.fretboardElement.replaceChildren();
    this.strings = [];

    controller.setGlobalCssVariable("--number-of-strings", numberOfStrings);

    if (numberOfStrings > 6) {
      controller.setGlobalCssVariable("--fretboard-height", 350);
    } else {
      controller.setGlobalCssVariable("--fretboard-height", 300);
    }

    for (let stringNumber = 0; stringNumber < numberOfStrings; stringNumber++) {
      var string = document.createElement("div");
      string.classList.add("string");

      // add thin stylings to certain strings
      if ((stringNumber >= 3 && !this.getAttribute("instrument").includes("Bass")) || this.getAttribute("instrument").includes("ukulele")) {
        string.classList.add("thin");
      }
      var startingNote = this.getAttribute("tuning")[stringNumber];

      for (let fretNumber = 0; fretNumber <= numberOfFrets; fretNumber++) {
        var fret = document.createElement("div");
        fret.classList.add("fret");

        var note = calculateNote(startingNote, fretNumber);
        fret.setAttribute("note", note);
        fret.setAttribute("tabindex", "0");
        fret.setAttribute("role", "button");
        fret.setAttribute("aria-label", "Play " + note);

        // convert shown note value to sharp if needed
        if (!this.getAttribute("showFlats") && note.includes("b")) {
          var octave = note[note.length - 1];
          note = note.slice(0, note.indexOf("-"));
          fret.setAttribute("shown-note", noteNames[noteNames.indexOf(note) - 1] + "#-" + octave);
        } else {
          fret.setAttribute("shown-note", note);
        }

        if (fretNumber == 0) {
          fret.classList.add("fret-zero");
        }

        // add classes to certain frets (used for styling with CSS)
        if (stringNumber == numberOfStrings - 1) {
          if (markedFretsSingle.includes(fretNumber)) {
            fret.classList.add("single-fretmarker");
          } else if (markedFretsDouble.includes(fretNumber)) {
            fret.classList.add("double-fretmarker");
          }
        } else if (stringNumber == numberOfStrings - 2) {
          if (markedFretsDouble.includes(fretNumber)) {
            fret.classList.add("double-fretmarker");
            fret.classList.add("double-fretmarker2");
          }
        } else if (stringNumber == 0) {
          fret.classList.add("numbered-fret");
          fret.setAttribute("number", fretNumber);
        }

        // add event listeners
        fret.addEventListener("click", (event) => {
          fb.playNote(event.target);
        });
        fret.addEventListener("mouseover", this.handleMouseOverFret);
        fret.addEventListener("mouseout", this.handleMouseOutFret);

        // add specific stylings for frets in lefthanded mode
        if (this.getAttribute("leftHanded")) {
          fret.style.borderRight = "0px solid";
          fret.style.borderLeft = "10px solid";

          if (fretNumber == 0) {
            fret.style.borderLeft = "15px solid white";
            fret.style.borderRight = "0px solid white";
          }

          string.prepend(fret);
        } else {
          string.append(fret);
        }

        this.frets.add(fret);
      }
      this.strings.push(string);
    }
    this.strings
      .slice()
      .reverse()
      .forEach((string) => this.fretboardElement.appendChild(string));
  }

  playNote(fret, duration = 250) {
    var note = fret.getAttribute("note");
    fret.classList.add("hovered");
    controller.playAudioBuffer(note);

    setTimeout(() => {
      fret.classList.remove("hovered");
    }, duration);
  }

  highlightFret(fret, style) {
    fret.removeEventListener("mouseover", this.handleMouseOverFret);
    fret.removeEventListener("mouseout", this.handleMouseOutFret);

    fret.classList.add(style);
  }

  unhighlightFret(fret, style) {
    fret.addEventListener("mouseover", this.handleMouseOverFret);
    fret.addEventListener("mouseout", this.handleMouseOutFret);

    fret.classList.remove(style);
  }

  handleMouseOverFret(event) {
    event.target.classList.add("hovered");
  }

  handleMouseOutFret(event) {
    event.target.classList.remove("hovered");
  }

  getAttribute(attribute) {
    return this.attributes[attribute];
  }

  setAttribute(attribute, value) {
    this.attributes[attribute] = value;

    // default to standard tuning if new instrument is selected
    if (attribute == "instrument") {
      fb.setAttribute("tuning", controller.getStandardTuning(value));
      // highlight "standard" tuning option
      var tuningOptions = Array.from(document.getElementById("tuning-options").children);
      tuningOptions.forEach((tuningOption) => {
        tuningOption.classList.remove("selected-li");
      });
      tuningOptions[0].classList.add("selected-li");
    }

    if (recorder && recorder.hasRecording()) {
      recorder.deleteRecording();
    }

    this.render();
  }
}

var controller = new Controller();
var fb = new Fretboard();
var scalePlayer;
var recorder;
var intervalTrainer;
