import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import OpenAI from "openai";
import "regenerator-runtime";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { useState, useEffect, useRef } from "react";
import { FaSquare } from "react-icons/fa";
import { AiOutlineAudio } from "react-icons/ai";
import { Page, Document, pdfjs } from 'react-pdf';
import getSystemPrompt from './systemPrompt';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const openai = new OpenAI({ apiKey: import.meta.env.VITE_OPENAI_API_KEY, dangerouslyAllowBrowser: true });

type Message = {
  role: "user" | "assistant";
  content: string;
};

function App() {
  const {
    listening,
    transcript,
    resetTranscript,
  } = useSpeechRecognition();
  const [history, setHistory] = useState<Message[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isPresentationStarted, setIsPresentationStarted] = useState(false);
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [inputTimeout, setInputTimeout] = useState<NodeJS.Timeout | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const handleListenAndToggleQuestionMode = () => {
    setIsQuestionMode((prev) => !prev);
    if (listening) {
      SpeechRecognition.stopListening();
      resetTranscript();
      if (isQuestionMode) {
        sendQuestion(partialTranscript);
      } else {
        sendGPT(partialTranscript);
      }
      setPartialTranscript("");
    } else {
      setPartialTranscript("");
      SpeechRecognition.startListening({
        interimResults: false,
        language: "ja-JP",
      });
      // 設定した時間後に自動的に音声入力を停止する
      const timeout = setTimeout(() => {
        if (listening) {
          SpeechRecognition.stopListening();
          if (isQuestionMode) {
            sendQuestion(partialTranscript);
          } else {
            sendGPT(partialTranscript);
          }
          setPartialTranscript("");
        }
      }, 20000); // 20秒後に停止
      setInputTimeout(timeout);
    }
  };

  useEffect(() => {
    if (transcript !== "") {
      setPartialTranscript(transcript);
      if (inputTimeout) {
        clearTimeout(inputTimeout);
      }
      // 無音期間を監視し、一定時間無音が続いた場合に音声入力を終了する
      const timeout = setTimeout(() => {
        if (listening) {
          SpeechRecognition.stopListening();
          if (isQuestionMode) {
            sendQuestion(partialTranscript);
          } else {
            sendGPT(partialTranscript);
          }
          setPartialTranscript("");
        }
      }, 5000); // 5秒無音が続いた場合に停止
      setInputTimeout(timeout);
    }
  }, [transcript]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (partialTranscript !== "") {
      timer = setTimeout(() => {
        if (isQuestionMode) {
          sendQuestion(partialTranscript);
        } else {
          sendGPT(partialTranscript);
        }
        setPartialTranscript("");
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [partialTranscript]);

  const startPresentation = () => {
    setPageNumber(1);
    setIsPresentationStarted(true);
    setIsStarted(true);
  };

  const sendGPT = async (message: string) => {
    const nextPageRegex = /次のページ|つぎのページ|次のスライド|つぎのスライド|次へ|つぎへ/i;
    const prevPageRegex = /前のページ|まえのページ|前のスライド|まえのスライド|戻る|もどる/i;

    if (nextPageRegex.test(message)) {
      goToNextPage();
    } else if (prevPageRegex.test(message)) {
      goToPrevPage();
    } else {
      const systemPrompt = getSystemPrompt(pageNumber);
      const body = JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ],
        model: "gpt-4o",
      });

      controllerRef.current = new AbortController();

      try {
        const response = await fetch(
          `https://api.openai.com/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
            },
            body,
            signal: controllerRef.current.signal,
          }
        );

        if (!response.ok) throw new Error("Fetch error");
        const data = await response.json();
        const choice = data.choices[0].message.content;
        setHistory([...history, { role: "assistant", content: choice }]);

        if (!isQuestionMode) {
          playVoice(choice);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Fetch error:", error);
        }
        setIsNavigating(false);
      }
    }
  };

  const sendQuestion = async (message: string) => {
    const systemPrompt = getSystemPrompt(pageNumber);
    const body = JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: `ページ${pageNumber}の内容に関する質問: ${message}` },
      ],
      model: "gpt-4o",
    });

    controllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `https://api.openai.com/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          body,
          signal: controllerRef.current.signal,
        }
      );

      if (!response.ok) throw new Error("Fetch error");
      const data = await response.json();
      const choice = data.choices[0].message.content;
      setHistory([...history, { role: "assistant", content: choice }]);

      playVoice(choice, true);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Fetch error:", error);
      }
      setIsNavigating(false);
    }
  };

  useEffect(() => {
    const fetchGPT = async () => {
      if (!isStarted) return;

      const systemPrompt = getSystemPrompt(pageNumber);
      const body = JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: `【ページ${pageNumber}】` },
        ],
        model: "gpt-4o",
      });

      controllerRef.current = new AbortController();

      try {
        const response = await fetch(
          `https://api.openai.com/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
            },
            body,
            signal: controllerRef.current.signal,
          }
        );

        if (!response.ok) throw new Error("Fetch error");
        const data = await response.json();
        const choice = data.choices[0].message.content;
        setHistory([...history, { role: "assistant", content: choice }]);

        playVoice(choice);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Fetch error:", error);
        }
        setIsNavigating(false);
      }
    };

    fetchGPT();

    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, [pageNumber, isStarted]);

  const goToNextPage = () => {
    if (isNavigating || pageNumber >= (numPages || 0)) return;
    setIsNavigating(true);
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
    const nextPageNumber = pageNumber + 1;
    setPageNumber(nextPageNumber);
    fetchGPTForNextPage(nextPageNumber);
  };

  const goToPrevPage = () => {
    if (isNavigating || pageNumber <= 1) return;
    setIsNavigating(true);
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
    const prevPageNumber = pageNumber - 1;
    setPageNumber(prevPageNumber);
    fetchGPTForNextPage(prevPageNumber);
  };

  const fetchGPTForNextPage = async (nextPageNumber: number) => {
    const systemPrompt = getSystemPrompt(nextPageNumber);
    const body = JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `【ページ${nextPageNumber}】` },
      ],
      model: "gpt-4o",
    });

    controllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `https://api.openai.com/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          body,
          signal: controllerRef.current.signal,
        }
      );

      if (!response.ok) throw new Error("Fetch error");
      const data = await response.json();
      const choice = data.choices[0].message.content;
      setHistory([...history, { role: "assistant", content: choice }]);

      playVoice(choice, false, () => setIsNavigating(false));
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Fetch error:", error);
      }
      setIsNavigating(false);
    }
  };

  const playVoice = async (message: string, isQuestion = false, onEndCallback?: () => void) => {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "echo",
      input: isQuestion ? `${message} 他に質問がありますか？` : message,
    });
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play();
    setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      if (isQuestion) {
        setAwaitingConfirmation(true);
      } else if (!awaitingConfirmation && pageNumber < (numPages || 0)) {
        goToNextPage(); // 自動的に次のページに移動
      }
      if (onEndCallback) onEndCallback();
    };
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const handleConfirmation = (transcript: string) => {
    const positiveResponse = /はい|そうです|OK|いいえ|No/i;
    if (awaitingConfirmation && positiveResponse.test(transcript)) {
      goToNextPage(); // 質問がない場合には次のページに進む
      setAwaitingConfirmation(false);
    } else if (awaitingConfirmation) {
      sendGPT(transcript); // If there's a follow-up question, process it
      setAwaitingConfirmation(false);
    }
  };

  useEffect(() => {
    if (awaitingConfirmation) {
      handleConfirmation(transcript);
    }
  }, [transcript, awaitingConfirmation]);

  const buttonClasses = `mt-4 w-[60px] h-[60px] flex items-center justify-center text-2xl ${
    listening ? "bg-red-500" : "bg-blue-500"
  } rounded-full text-white`;
  const iconClass = listening ? <FaSquare /> : <AiOutlineAudio />;

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const local = `http://localhost:5173/dis.pdf`;

  return (
    <>
      <div className="flex flex-col items-center w-full h-screen">
        <div className="w-full h-full flex justify-center">
          <div className="flex-grow flex items-center justify-center max-w-[10000px]">
            <Document
              file={local}
              onLoadSuccess={onDocumentLoadSuccess}
            >
              <Page pageNumber={pageNumber} />
            </Document>
          </div>
        </div>
        <div>
          <p className="text-center">
            Page {pageNumber} of {numPages}
          </p>
        </div>

        <div className="w-full max-w-[400px] sm:max-w-[100px] md:max-w-[100px] lg:max-w-[750px] px-4">
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-bold mb-2">Voice_to_Text</h2>
            <p className="text-gray-700">
              {listening
                ? partialTranscript
                : history[history.length - 1]
                ? history[history.length - 1].content
                : ""}
            </p>
          </div>
        </div>

        <div className="flex space-x-2 mb-2">
          <button onClick={startPresentation}
            className={`px-4 py-2 rounded mt-4 ${
              isPresentationStarted ? 'bg-gray-500 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
            } text-white`}
            disabled={isPresentationStarted}
          >
            {isPresentationStarted ? '商談中...' : '商談開始'}
          </button>
          {/* <button onClick={goToPrevPage} disabled={pageNumber === 1} className="px-4 py-4 bg-blue-500 text-white rounded disabled:opacity-50 mt-4">
            前のページ
          </button>
          <button onClick={goToNextPage} disabled={pageNumber === numPages} className="px-4 py-4 bg-blue-500 text-white rounded disabled:opacity-50 mt-4">
            次のページ
          </button> */}
          <button onClick={handleListenAndToggleQuestionMode} className={`${buttonClasses} py-4`}>
            <i>{iconClass}</i>
          </button>
          <button onClick={handleStop} disabled={!isPlaying} className="px-3 py-4 bg-red-500 text-white rounded disabled:opacity-50 mt-4">
            停止
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
