import { useState, useRef, useEffect } from 'react';
import './App.css';
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

function App() {
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [fileName, setFileName] = useState('');
  const [sequences, setSequences] = useState([]);
  const [addingSequence, setAddingSequence] = useState(false);
  const [addingItemToSequenceIndex, setAddingItemToSequenceIndex] = useState(null);
  const [editingSequenceIndex, setEditingSequenceIndex] = useState(null); // Track sequence being edited
  const [editingItemIndex, setEditingItemIndex] = useState(null); // Track item being edited
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [waveformData, setWaveformData] = useState(null);
  const waveformCanvasRef = useRef(null);

  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  const ffmpeg = new FFmpeg();

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      setAudioFile(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      // Decode audio for waveform
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        generateWaveformData(audioBuffer);
      };
      reader.readAsArrayBuffer(file);
    }
  };
  const generateWaveformData = (audioBuffer) => {
    const points = 800; // Matches canvas width
    const channelData = audioBuffer.getChannelData(0); // Use first channel (mono)
    const segmentSize = Math.floor(channelData.length / points);
    const waveformData = [];

    for (let i = 0; i < points; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize, channelData.length);
      let min = 1; // Max negative amplitude
      let max = -1; // Max positive amplitude
      for (let j = start; j < end; j++) {
        const sample = channelData[j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      waveformData.push({ min, max });
    }
    setWaveformData(waveformData);
  };
  const drawWaveform = (canvas, waveformData, currentTime, audioDuration) => {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw center line
    ctx.strokeStyle = 'gray';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Draw waveform
    if (waveformData) {
      ctx.strokeStyle = 'blue';
      ctx.beginPath();
      waveformData.forEach((point, i) => {
        const x = i * (width / waveformData.length);
        const yMin = height / 2 - point.max * (height / 2); // Positive peaks go up
        const yMax = height / 2 - point.min * (height / 2); // Negative peaks go down
        ctx.moveTo(x, yMin);
        ctx.lineTo(x, yMax);
      });
      ctx.stroke();
    }

    // Draw playhead
    if (audioDuration > 0) {
      const x = (currentTime / audioDuration) * width;
      ctx.strokeStyle = 'red';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  };
  const handleWaveformClick = (event) => {
    if (!audioDuration) return;
    const canvas = waveformCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = (x / canvas.width) * audioDuration;
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };
  useEffect(() => {
    if (waveformData && waveformCanvasRef.current) {
      drawWaveform(waveformCanvasRef.current, waveformData, currentTime, audioDuration);
    }
  }, [waveformData, currentTime, audioDuration]);

  async function loadFFmpeg() {
    await ffmpeg.load({
      coreURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL("https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm", "application/wasm"),
    });
    setFfmpegLoaded(true);
    console.log("FFmpeg is ready!");
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleAddSequence = () => {
    const start = parseFloat(document.getElementById('sequenceStart').value);
    const end = parseFloat(document.getElementById('sequenceEnd').value);
    if (isNaN(start) || isNaN(end) || start >= end) {
      alert('Invalid start or end time');
      return;
    }
    setSequences([...sequences, { start, end, items: [] }]);
    setAddingSequence(false);
  };

  const handleAddItem = (sequenceIndex) => {
    const type = document.getElementById(`itemType${sequenceIndex}`).value;
    const lettersInput = document.getElementById(`itemLetters${sequenceIndex}`).value.toLowerCase();
    const start = parseFloat(document.getElementById(`itemStart${sequenceIndex}`).value);
    const end = parseFloat(document.getElementById(`itemEnd${sequenceIndex}`).value);

    if (type === 'normal') {
      if (lettersInput.length !== 1 || !['a', 'i', 'o', 'u'].includes(lettersInput)) {
        alert('Normal letter must be a single vowel: a, i, o, u');
        return;
      }
    } else if (type === 'group') {
      if (!lettersInput.split('').every(letter => ['a', 'i', 'o', 'u'].includes(letter))) {
        alert('Grouped letters must only contain vowels: a, i, o, u');
        return;
      }
    }

    const sequence = sequences[sequenceIndex];
    if (start < sequence.start || end > sequence.end || start >= end) {
      alert('Item times must be within sequence times and start < end');
      return;
    }

    const newItem = type === 'normal'
      ? { type: 'normal', letter: lettersInput, start, end }
      : { type: 'group', letters: lettersInput, start, end };

    const updatedSequences = [...sequences];
    updatedSequences[sequenceIndex].items.push(newItem);
    setSequences(updatedSequences);
    setAddingItemToSequenceIndex(null);
  };

  const rewindAudio = (seconds) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seconds);
    }
  };
  const processSequence = (sequence) => {
    const itemTexts = [];
    const allHighlightTimes = [];

    sequence.items.forEach((item) => {
      if (item.type === 'normal') {
        itemTexts.push(item.letter);
        allHighlightTimes.push({ start: item.start, end: item.end });
      } else if (item.type === 'group') {
        const groupLetters = item.letters.split('');
        const groupDuration = (item.end - item.start) / groupLetters.length;
        const groupHighlightTimes = groupLetters.map((_, index) => ({
          start: item.start + index * groupDuration,
          end: item.start + (index + 1) * groupDuration,
        }));
        itemTexts.push(item.letters);
        allHighlightTimes.push(...groupHighlightTimes);
      }
    });

    const text = itemTexts.join(' ');
    return { text, highlightTimes: allHighlightTimes };
  };

  const SequenceComponent = ({ sequence, currentTime }) => {
    const { text, highlightTimes } = processSequence(sequence);

    if (currentTime < sequence.start || currentTime > sequence.end) return null;

    let highlightIndex = 0;
    return (
      <div className="sequence-container">
        {text.split('').map((char, index) => {
          if (char === ' ') {
            return <span key={index}>&nbsp;</span>;
          } else {
            const { start, end } = highlightTimes[highlightIndex];
            let progress = 0;
            if (currentTime >= start && currentTime <= end) {
              progress = (currentTime - start) / (end - start);
            } else if (currentTime > end) {
              progress = 1;
            }
            const style = {
              background: `linear-gradient(to right, yellow ${progress * 100}%, white ${progress * 100}%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            };
            highlightIndex++;
            return (
              <span key={index} style={style}>
                {char}
              </span>
            );
          }
        })}
      </div>
    );
  };

  const renderText = (ctx, text, highlightTimes, currentTime, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#00FF00';  // Changed from 'black' to 'green'
    ctx.fillRect(0, 0, width, height);
    ctx.font = '64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const xBase = width / 2;
    const y = height / 2;
    const letterSpacing = 30;

    let highlightIndex = 0;
    text.split('').forEach((char, index) => {
      const x = xBase + (index - (text.length - 1) / 2) * letterSpacing;
      if (char !== ' ') {
        const { start, end } = highlightTimes[highlightIndex];
        let progress = 0;
        if (currentTime >= start && currentTime <= end) {
          progress = (currentTime - start) / (end - start);
        } else if (currentTime > end) {
          progress = 1;
        }
        const letterWidth = ctx.measureText(char).width;

        ctx.fillStyle = 'white';
        ctx.fillText(char, x, y);

        if (progress > 0) {
          ctx.fillStyle = 'yellow';
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - letterWidth / 2, y - 28, letterWidth * progress, 48);
          ctx.clip();
          ctx.fillText(char, x, y);
          ctx.restore();
        }
        highlightIndex++;
      }
    });
  };

  const generateVideoBlob = async () => {
    if (!audioDuration) {
      alert('Audio duration not loaded yet. Please wait until the audio loads.');
      return null;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];

    recorder.ondataavailable = (event) => {
      chunks.push(event.data);
    };

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      recorder.start();

      const frameRate = 30;
      const totalFrames = audioDuration * frameRate;

      let frame = 0;
      const renderFrame = () => {
        if (frame > totalFrames) {
          recorder.stop();
          return;
        }
        const currentTime = frame / frameRate;
        let rendered = false;
        for (const sequence of sequences) {
          if (currentTime >= sequence.start && currentTime <= sequence.end) {
            const { text, highlightTimes } = processSequence(sequence);
            renderText(ctx, text, highlightTimes, currentTime, canvas.width, canvas.height);
            rendered = true;
            break;
          }
        }
        if (!rendered) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#00FF00';  // Changed from 'black' to 'green'
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        frame++;
        setTimeout(renderFrame, 1000 / frameRate);
      };
      renderFrame();
    });
  };

  const mergeWithAudio = async (videoBlob) => {
    if (!audioFile) {
      alert('No audio file uploaded');
      return;
    }

    await loadFFmpeg();

    const videoData = await videoBlob.arrayBuffer();
    const videoUint8 = new Uint8Array(videoData);
    const audioData = await audioFile.arrayBuffer();
    const audioUint8 = new Uint8Array(audioData);

    await ffmpeg.writeFile('video.webm', videoUint8);
    await ffmpeg.writeFile('audio.mp3', audioUint8);

    await ffmpeg.exec([
      '-i', 'video.webm',
      '-i', 'audio.mp3',
      '-c:v', 'copy',
      '-c:a', 'aac',
      'output.mp4'
    ]);

    const outputData = await ffmpeg.readFile('output.mp4');
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });

    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oiiaremix.mp4';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateVideoWithAudio = async () => {
    const videoBlob = await generateVideoBlob();
    if (videoBlob) {
      await mergeWithAudio(videoBlob);
    }
  };

  return (
    <div className="app-container">
      <h1>SPINNING CAT KAROIIAKE MAKER</h1>
      <label htmlFor="file-upload" className="custom-file-upload">
        Choose MP3 File
      </label>
      <input
        id="file-upload"
        className="file-input"
        type="file"
        accept=".mp3"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
      {audioUrl ? (
        <div className="audio-controls">
          <p>Playing: {fileName}</p>
          <audio
            src={audioUrl}
            ref={audioRef}
            controls
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => setAudioDuration(audioRef.current.duration)}
          />
          <canvas
            className="waveform-canvas"
            ref={waveformCanvasRef}
            width="800"
            height="100"
            onClick={handleWaveformClick}
          />
          <div className="playback-speed">
            <label>Playback Speed: {playbackSpeed.toFixed(1)}x</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
            />

          </div>
          <div>
            {sequences.map((sequence, index) => (
              <SequenceComponent
                key={index}
                sequence={sequence}
                currentTime={currentTime}
              />
            ))}
          </div>
          <div className="rewind-buttons">
            <button onClick={() => rewindAudio(0.1)}>-0.1s</button>
            <button onClick={() => rewindAudio(0.25)}>-0.25s</button>
            <button onClick={() => rewindAudio(0.5)}>-0.5s</button>
          </div>
          <div>
            <button className="generate-video-button" onClick={handleGenerateVideoWithAudio}>
              Generate Video with Audio
            </button>
          </div>
        </div>
      ) : (
        <p>Please upload an MP3 file to start</p>
      )}
      <div className="sequences">
        <h2>Sequences</h2>
        {addingSequence ? (
          <div className="add-sequence-form">
            <h3>Add New Sequence</h3>
            <div className="form-group">
              <label htmlFor="sequenceStart">Start time (s)</label>
              <input type="number" id="sequenceStart" step="0.01" />
              <button
                className="use-current-time-button"
                onClick={() => document.getElementById('sequenceStart').value = currentTime.toFixed(2)}
              >
                Use Current Time
              </button>
            </div>
            <div className="form-group">
              <label htmlFor="sequenceEnd">End time (s)</label>
              <input type="number" id="sequenceEnd" step="0.01" />
              <button
                className="use-current-time-button"
                onClick={() => document.getElementById('sequenceEnd').value = currentTime.toFixed(2)}
              >
                Use Current Time
              </button>
            </div>
            <button className="add-button" onClick={handleAddSequence}>Add</button>
            <button onClick={() => setAddingSequence(false)}>Cancel</button>
          </div>
        ) : (
          <button className="add-button" onClick={() => setAddingSequence(true)}>Add Sequence</button>
        )}
        {sequences.map((sequence, index) => (
          <div className="sequence" key={index}>
            <h3>Sequence {index + 1}: {sequence.start.toFixed(2)}s - {sequence.end.toFixed(2)}s</h3>
            <button className="edit-button" onClick={() => setEditingSequenceIndex(index)}>
              Edit Sequence
            </button>
            <button className="delete-button" onClick={() => setSequences(sequences.filter((_, i) => i !== index))}>
              Delete Sequence
            </button>
            {editingSequenceIndex === index ? (
              <div className="edit-sequence-form">
                <h4>Edit Sequence {index + 1}</h4>
                <div className="form-group">
                  <label htmlFor={`editSequenceStart${index}`}>Start time (s)</label>
                  <input
                    type="number"
                    defaultValue={sequence.start.toFixed(2)}
                    id={`editSequenceStart${index}`}
                    step="0.01"
                  />
                  <button
                    className="use-current-time-button"
                    onClick={() => document.getElementById(`editSequenceStart${index}`).value = currentTime.toFixed(2)}
                  >
                    Use Current Time
                  </button>
                </div>
                <div className="form-group">
                  <label htmlFor={`editSequenceEnd${index}`}>End time (s)</label>
                  <input
                    type="number"
                    defaultValue={sequence.end.toFixed(2)}
                    id={`editSequenceEnd${index}`}
                    step="0.01"
                  />
                  <button
                    className="use-current-time-button"
                    onClick={() => document.getElementById(`editSequenceEnd${index}`).value = currentTime.toFixed(2)}
                  >
                    Use Current Time
                  </button>
                </div>
                <button
                  onClick={() => {
                    const newStart = parseFloat(document.getElementById(`editSequenceStart${index}`).value);
                    const newEnd = parseFloat(document.getElementById(`editSequenceEnd${index}`).value);
                    if (isNaN(newStart) || isNaN(newEnd) || newStart >= newEnd) {
                      alert('Invalid start or end time');
                      return;
                    }
                    const updatedSequences = [...sequences];
                    updatedSequences[index].start = newStart;
                    updatedSequences[index].end = newEnd;
                    setSequences(updatedSequences);
                    setEditingSequenceIndex(null);
                  }}
                >
                  Save
                </button>
                <button onClick={() => setEditingSequenceIndex(null)}>Cancel</button>
              </div>
            ) : null}
            <ul className="item-list">
              {sequence.items.map((item, itemIndex) => (
                <li className="item" key={itemIndex}>
                  {item.type === 'normal' ? (
                    `Normal: '${item.letter}' (${item.start.toFixed(2)}s - ${item.end.toFixed(2)}s)`
                  ) : (
                    `Group: '${item.letters}' (${item.start.toFixed(2)}s - ${item.end.toFixed(2)}s)`
                  )}
                  <button
                    className="edit-button"
                    onClick={() => setEditingItemIndex({ sequenceIndex: index, itemIndex })}
                  >
                    Edit Item
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => {
                      const updatedSequences = [...sequences];
                      updatedSequences[index].items = updatedSequences[index].items.filter(
                        (_, i) => i !== itemIndex
                      );
                      setSequences(updatedSequences);
                    }}
                  >
                    Delete Item
                  </button>
                  {editingItemIndex?.sequenceIndex === index && editingItemIndex.itemIndex === itemIndex ? (
                    <div className="edit-item-form">
                      <h4>Edit Item in Sequence {index + 1}</h4>
                      <div className="form-group">
                        <label htmlFor={`editItemType${index}-${itemIndex}`}>Item Type</label>
                        <select
                          id={`editItemType${index}-${itemIndex}`}
                          defaultValue={item.type}
                        >
                          <option value="normal">Normal Letter</option>
                          <option value="group">Grouped Letters</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor={`editItemLetters${index}-${itemIndex}`}>Letter(s)</label>
                        <input
                          type="text"
                          id={`editItemLetters${index}-${itemIndex}`}
                          defaultValue={item.letter || item.letters}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`editItemStart${index}-${itemIndex}`}>Start time (s)</label>
                        <input
                          type="number"
                          id={`editItemStart${index}-${itemIndex}`}
                          defaultValue={item.start.toFixed(2)}
                          step="0.01"
                        />
                        <button
                          className="use-current-time-button"
                          onClick={() => document.getElementById(`editItemStart${index}-${itemIndex}`).value = currentTime.toFixed(2)}
                        >
                          Use Current Time
                        </button>
                      </div>
                      <div className="form-group">
                        <label htmlFor={`editItemEnd${index}-${itemIndex}`}>End time (s)</label>
                        <input
                          type="number"
                          id={`editItemEnd${index}-${itemIndex}`}
                          defaultValue={item.end.toFixed(2)}
                          step="0.01"
                        />
                        <button
                          className="use-current-time-button"
                          onClick={() => document.getElementById(`editItemEnd${index}-${itemIndex}`).value = currentTime.toFixed(2)}
                        >
                          Use Current Time
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          const type = document.getElementById(`editItemType${index}-${itemIndex}`).value;
                          const start = parseFloat(document.getElementById(`editItemStart${index}-${itemIndex}`).value);
                          const end = parseFloat(document.getElementById(`editItemEnd${index}-${itemIndex}`).value);
                          const lettersInput = document.getElementById(`editItemLetters${index}-${itemIndex}`).value.toLowerCase();
                          if (type === 'normal') {
                            if (lettersInput.length !== 1 || !['a', 'i', 'o', 'u'].includes(lettersInput)) {
                              alert('Normal letter must be a single vowel: a, i, o, u');
                              return;
                            }
                          } else if (type === 'group') {
                            if (!lettersInput.split('').every(letter => ['a', 'i', 'o', 'u'].includes(letter))) {
                              alert('Grouped letters must only contain vowels: a, i, o, u');
                              return;
                            }
                          }
                          const sequence = sequences[index];
                          if (start < sequence.start || end > sequence.end || start >= end) {
                            alert('Item times must be within sequence times and start < end');
                            return;
                          }
                          const updatedSequences = [...sequences];
                          updatedSequences[index].items[itemIndex] = type === 'normal'
                            ? { type: 'normal', letter: lettersInput, start, end }
                            : { type: 'group', letters: lettersInput, start, end };
                          setSequences(updatedSequences);
                          setEditingItemIndex(null);
                        }}
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingItemIndex(null)}>Cancel</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {addingItemToSequenceIndex === index ? (
              <div className="add-item-form">
                <h4>Add Item to Sequence {index + 1}</h4>
                <div className="form-group">
                  <label htmlFor={`itemType${index}`}>Item Type</label>
                  <select id={`itemType${index}`}>
                    <option value="normal">Normal Letter</option>
                    <option value="group">Grouped Letters</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor={`itemLetters${index}`}>Letter(s)</label>
                  <input type="text" id={`itemLetters${index}`} />
                </div>
                <div className="form-group">
                  <label htmlFor={`itemStart${index}`}>Start time (s)</label>
                  <input type="number" id={`itemStart${index}`} step="0.01" />
                  <button
                    className="use-current-time-button"
                    onClick={() => document.getElementById(`itemStart${index}`).value = currentTime.toFixed(2)}
                  >
                    Use Current Time
                  </button>
                </div>
                <div className="form-group">
                  <label htmlFor={`itemEnd${index}`}>End time (s)</label>
                  <input type="number" id={`itemEnd${index}`} step="0.01" />
                  <button
                    className="use-current-time-button"
                    onClick={() => document.getElementById(`itemEnd${index}`).value = currentTime.toFixed(2)}
                  >
                    Use Current Time
                  </button>
                </div>
                <button className="add-button" onClick={() => handleAddItem(index)}>Add</button>
                <button onClick={() => setAddingItemToSequenceIndex(null)}>Cancel</button>
              </div>
            ) : (
              <button className="add-button" onClick={() => setAddingItemToSequenceIndex(index)}>Add Item</button>
            )}
          </div>
        ))}
      </div>
      <canvas ref={canvasRef} width="640" height="480" style={{ display: 'none' }} />
    </div>
  );
}

export default App;