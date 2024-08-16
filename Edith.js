const Serial = require('serialport');
const i2c = require('i2c-bus');
const oledDisp = require('oled-i2c-bus');
const font = require('oled-font-5x7'); // Custom fork used here to flip the font
const speech = require('@google-cloud/speech');
const recorder = require('node-record-lpcm16');
const dialogflow = require('@google-cloud/dialogflow');
const say = require('say');
const { exec, spawn } = require('child_process');

const axios = require('axios');
const fs = require('fs');
const ytdl = require('ytdl-core');
const extract = require('ffmpeg-extract-audio');
const player = require('play-sound')({});

const client = new speech.SpeechClient();
const sessionClient = new dialogflow.SessionsClient();
const sessionPath = sessionClient.projectAgentSessionPath('project-name', +new Date());

const opts = { width: 128, height: 64, address: 0x3C };
const oled = new oledDisp(i2cBus.openSync(1), opts);

const request = {
    config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
    },
    interimResults: true,
    singleUtterance: false,
};

console.log('started');

var btCon = false;
var btInterval = setInterval(() => {
    const port = new Serial('/dev/rfcomm0', { baudRate: 115000 }, (err) => {
        if (err) {
            console.error(err);
        } else {
            btCon = true;
            exec('espeak ""');
            exec('espeak "Connected to Bluetooth device"');
        }
    });

    port.on('open', () => {
        oled.turnOnDisplay();
        oled.clearDisplay();
        startOS(port);
        handleBt(port);
        clearInterval(btInterval);
    });
}, 1000);

var weather = '';

function handleBt(port) {
    var isCallRunning = false;

    port.on('data', (data) => {
        var msg = data.toString().replace('\r\n', '');

        console.log(msg);

        if (msg.startsWith('weather: ')) {
            weather = msg.replace('weather: ', '');
            oled.setCursor(1, 20);
            oled.writeString(font, 1, reverseString(weather), 1, true);
        } else if (msg.startsWith('notification: ') && !isCallRunning) {
            var alert = msg.replace('notification: ', '');
            var parts = alert.split(':');
            exec('espeak ""');
            exec('espeak "New Alert!"');
        } else if (msg.startsWith('sms: ') && !isCallRunning) {
            var alert = msg.replace('sms: ', '');
            var parts = alert.split(':');
            showAlert('New SMS', parts);
            exec('espeak ""');
            exec('espeak "New SMS!"');
        } else if (msg.endsWith('is Calling')) {
            isCallRunning = true;
            showAlert(msg, ['']);
            exec('espeak ""');
            exec('espeak "' + msg + '"');
            setTimeout(() => {
                isCallRunning = false;
            }, 6000);
        } else if (msg == 'hung up') {
            showAlert('Hung Up', ['']);
        } else if (msg.startsWith('location: ')) {
            var loc = msg.replace('location: ', '');
            showAlert('', [loc, '']);
            exec('espeak ""');
            exec('espeak "Your current location is: ' + loc + '"');
        }
    });
}

function reverseString(str) {
    return str.split("").reverse().join("");
}

function createLines(txt, isBig) {
    var len = isBig ? 6 : 20;
    let words = txt.split(' ');
    let lines = [];
    let i = 0;
    words.forEach(w => {
        if (lines[i]) {
            if (lines[i].length >= len) {
                i += 1;
                lines[i] = w + ' ';
            } else {
                lines[i] += w + ' ';
            }
        } else {
            lines[i] = w + ' ';
        }
    });
    return lines.reverse();
}

function startOS(port) {
    showTime();
    listen(port);
}

var timeInterval = '';

function showTime() {
    var printedTime = '';
    timeInterval = setInterval(() => {
        var time = new Date();
        var currTime = time.getHours() + ':' + time.getMinutes().toString().padStart(2, '0');
        if (currTime !== printedTime) {
            oled.clearDisplay();
            oled.setCursor(1, 1);
            oled.writeString(font, 2, reverseString(currTime), 1, true);
            oled.setCursor(1, 20);
            oled.writeString(font, 1, reverseString(weather), 1, true);
            printedTime = currTime;
        }
    }, 1000);
}

function showAlert(header, texts) {
    clearInterval(timeInterval);
    oled.clearDisplay();

    let top = 5;
    if (texts.length > 1) {
        createLines(reverseString(header), true).forEach(el => {
            oled.setCursor(1, top);
            oled.writeString(font, 2, el, 1, true);
            top += 10;
        });
        top += 10;
        createLines(reverseString(texts[0]), false).forEach(el => {
            oled.setCursor(1, top);
            oled.writeString(font, 1, el, 1, true);
            top += 10;
        });
        createLines(reverseString(texts[1]), false).forEach(el => {
            oled.setCursor(1, top);
            oled.writeString(font, 1, el, 1, true);
            top += 10;
        });
    } else if (texts.length === 1) {
        oled.setCursor(1, top);
        oled.writeString(font, 2, reverseString(header), 1, true);
        top += 10;
        createLines(reverseString(texts[0]), false).forEach(el => {
            oled.setCursor(1, top);
            oled.writeString(font, 1, el, 1, true);
            top += 10;
        });
    }

    setTimeout(() => showTime(), 6000);
}

function listen(port) {
    const recognizeStream = client.streamingRecognize(request)
        .on('error', error => {
            console.error(error);
            listen(port);
        })
        .on('data', data => {
            if (data.results[0] && data.results[0].alternatives[0].confidence > 0.5) {
                var words = data.results[0].alternatives[0].transcript.trim().toLowerCase();
                processSpeechNew(words, port);
            }
        });

    recorder.record({
        sampleRateHertz: 16000,
        threshold: 0.5,
        recordProgram: 'arecord',
        silence: '5.0'
    }).stream()
        .on('error', error => {
            console.error(error);
            listen(port);
        })
        .pipe(recognizeStream);

    setTimeout(() => {
        exec('espeak ""');
        exec('espeak "Hi! I am listening to you. Call me when needed"');
    }, 3000);
}

var isSearchingMusic = false;
var isChoosingMusic = false;
var currentMusicIndex = 0;
var musicList = [];
var music = '';

var currentList = [];
var currentIdx = 0;

async function processSpeechNew(speech, port) {
    const request = {
        session: sessionPath,
        queryInput: {
            text: {
                text: speech,
                languageCode: 'en-US',
            },
        },
    };

    console.log(speech);
    showAlert('Speech', [speech]);

    const responses = await sessionClient.detectIntent(request);
    const txt = responses[0].queryResult.fulfillmentText;

    if (txt) {
        console.log(txt);

        if (txt.startsWith('news: ')) {
            manageNews(txt.replace('news: ', ''));
        } else if (txt.startsWith('search: ')) {
            manageSearch(txt.replace('search: ', ''));
        } else if (txt.startsWith('weather: ')) {
            manageWeather(txt.replace('weather: ', ''));
        } else if (txt.startsWith('err: ')) {
            saySpeech(txt.replace('err: ', ''));
        } else if (txt === 'find.location') {
            port.write('location');
            showAlert('...', []);
            saySpeech('Finding you');
        } else {
            saySpeech(txt);
        }
    }
}

function saySpeech(txt) {
    exec('espeak ""');
    exec('espeak "' + txt + '"');
}

function manageNews(txt) {
    if (txt === 'news.search - repeat') {
        saySpeech(currentList[currentIdx].source.name + ' said: ' + currentList[currentIdx].title);
    } else if (txt === 'news.search - next') {
        currentIdx = currentIdx === currentList.length - 1 ? 0 : currentIdx + 1;
        saySpeech(currentList[currentIdx].source.name + ' said: ' + currentList[currentIdx].title);
    } else if (txt === 'news.search - previous') {
        if (currentIdx === 0) {
            saySpeech('You are currently on the first result');
        } else {
            currentIdx -= 1;
            saySpeech(currentList[currentIdx].source.name + ' said: ' + currentList[currentIdx].title);
        }
    } else {
        let newsArray = JSON.parse(txt.replace('news: ', '')).articles;
        currentList = newsArray;
        currentIdx = 0;
        saySpeech(currentList[currentIdx].source.name + ' said: ' + currentList[currentIdx].title);
    }
    showAlert(currentList[currentIdx].source.name, [currentList[currentIdx].title]);
}

function manageSearch(txt) {
    if (txt === 'web.search - repeat') {
        saySpeech(currentList[currentIdx].title + ' described as: ' + currentList[currentIdx].snippet);
    } else if (txt === 'web.search - next') {
        currentIdx = currentIdx === currentList.length - 1 ? 0 : currentIdx + 1;
        saySpeech(currentList[currentIdx].title + ' described as: ' + currentList[currentIdx].snippet);
    } else if (txt === 'web.search - previous') {
        if (currentIdx === 0) {
            saySpeech('You are currently on the first result');
        } else {
            currentIdx -= 1;
            saySpeech(currentList[currentIdx].title + ' described as: ' + currentList[currentIdx].snippet);
        }
    } else {
        let resArray = JSON.parse(txt);
        currentList = resArray.items;
        currentIdx = 0;
        saySpeech(currentList[currentIdx].title + ' described as: ' + currentList[currentIdx].snippet);
    }
    showAlert(currentList[currentIdx].snippet, ['']);
}

function manageWeather(txt) {
    const data = JSON.parse(txt);
    const weatherSpeech = `It will be ${data.day.condition.text}. With a maximum temperature of ${data.day.maxtemp_c} Celsius and a minimum of ${data.day.mintemp_c} Celsius.`;
    saySpeech(weatherSpeech);
    showAlert('', [weatherSpeech]);
}
