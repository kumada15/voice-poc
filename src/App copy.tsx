import OpenAI from "openai";
import "regenerator-runtime";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { useState, useEffect } from "react";
import { FaSquare } from "react-icons/fa";
import { AiOutlineAudio } from "react-icons/ai";
import FramedImage from "./FrameImage.tsx";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const openai = new OpenAI();

function App() {
  const {
    listening,
    transcript,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();
  const [history, setHistory] = useState<Message[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");

  const handleListen = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      resetTranscript();
      sendGPT(partialTranscript);
      setPartialTranscript("");
    } else {
      setPartialTranscript("");
      SpeechRecognition.startListening({
        interimResults: false,
        language: "ja-JP",
      });
    }
  };

  useEffect(() => {
    if (transcript !== "") {
      setPartialTranscript(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (partialTranscript !== "") {
      timer = setTimeout(() => {
        sendGPT(partialTranscript);
        setPartialTranscript("");
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [partialTranscript]);

  const sendGPT = async (message: string) => {
    const systemPrompt = `
    あなたはAWSのソリューションプロバイダーであるRelicの営業担当です。Relicは以下のようなAWSに関連するソリューションを提供しています。
    マークダウンなどを使わず必ず文章で出力してください。返答は短くしてユーザと対話することを意識してください。一度に多くの情報は不要です。

    AWSの設計から運用までのあらゆる支援
    AWSアーキテクチャ設計、構築管理・IaC導入支援、SREアドバイザリーなど
    AWSコスト削減 (3%以上のコスト削減が確約)
    AWS請求代行 (請求書での支払いが可能)
    
    特にAWSのソリューションプロバイダーとして、Relicを経由してAWSサービスを利用することで、お客様はAWS利用料を3%以上割引価格で利用できます。
    また、既存のAWSアカウントのコスト削減や、新規AWSアカウント発行の際の割引適用など、お客様のニーズに合わせて柔軟に対応が可能です。導入までの所要期間は2~3週間程度です。
    さらに、お客様のAWSアカウントの利用状況を無料で診断し、コスト削減できそうな箇所と削減シミュレーションを提示するサービスも提供しています。実際の削減対応まで複数の支援形態でご支援可能です。
    以上の内容を踏まえ、お客様のAWS利用におけるお悩みをヒアリングし、Relicのソリューションを用いてどのように課題解決できるかを提案してください。その際、事例として挙げられているBtoB SaaSのコスト削減事例も交えながら、具体的なメリットをアピールするようにしてください。
    `;
    const body = JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
      model: "gpt-4o",
    });
    const response = await fetch(
      `https://api.openai.com/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body,
      }
    );

    if (!browserSupportsSpeechRecognition) {
      return <span>Browser doesn't support speech recognition.</span>;
    }

    const data = await response.json();
    const choice = data.choices[0].message.content;
    setHistory([...history, { role: "assistant", content: choice }]);
    setTimeout(() => {
      playVoice(choice);
    }, 500);
  };

  const playVoice = async(message: string) => {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: message,
    });
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
  };
  
  // const playVoice = async (message: string) => {
  //   const response = await fetch(
  //     `https://deprecatedapis.tts.quest/v2/voicevox/audio/?key=${
  //       import.meta.env.VITE_VOICEVOX_API_KEY
  //     }&speaker=0&pitch=0&intonationScale=1&speed=1.2&text=${message}`
  //   );
  //   const blob = await response.blob();
  //   const audio = new Audio(URL.createObjectURL(blob));
  //   audio.play();
  // };

  const buttonClasses = `mt-4 w-[60px] h-[60px] flex items-center justify-center text-2xl ${
    listening ? "bg-red-500" : "bg-blue-500"
  } rounded-full text-white`;
  const iconClass = listening ? <FaSquare /> : <AiOutlineAudio />;

  return (
    <>
      <div className="flex flex-col items-center w-full min-h-screen">
        <img
          src="https://ucarecdn.com/b6b3f827-c521-4835-a7d4-5db0c87c9818/-/format/auto/"
          alt="キャラクターの画像"
          className="w-full h-auto sm:w-full object-cover"
        />
        <div className="w-full max-w-[400px] sm:max-w-full sm:px-4 mt-4">
          <FramedImage
            characterName="ずんだもん"
            dialogueText={
              listening
                ? partialTranscript
                : history[history.length - 1]
                ? history[history.length - 1].content
                : ""
            }
          />
        </div>
        <button onClick={handleListen} className={buttonClasses}>
          <i>{iconClass}</i>
        </button>
      </div>
    </>
  );
}

export default App;
