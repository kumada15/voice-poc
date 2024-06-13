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
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();
  const [history, setHistory] = useState<Message[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isExplanationComplete, setIsExplanationComplete] = useState(false);

  useEffect(() => {
    setCurrentPage(pageNumber);
    localStorage.setItem('currentPage', pageNumber.toString());
  }, [pageNumber]);

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

  const startPresentation = () => {
    setPageNumber(1);
    setUserMessage("【ページ１】");
  };

  const sendGPT = async (message: string) => {
    const nextPageRegex = /次のページ|つぎのページ|次のスライド|つぎのスライド|次へ|つぎへ/i;
    const prevPageRegex = /前のページ|まえのページ|前のスライド|まえのスライド|戻る|もどる/i;

    if (nextPageRegex.test(message)) {
      goToNextPage();
      setUserMessage(`【ページ${pageNumber}】`);
    } else if (prevPageRegex.test(message)) {
      goToPrevPage();
      setUserMessage(`【ページ${pageNumber}】`);
    } else {
      setUserMessage(message);
    }
  };

  useEffect(() => {
    const fetchGPT = async () => {
      if (userMessage || (!isExplanationComplete && currentPage <= (numPages || Infinity))) {
        const systemPrompt = `
        先ず与えられた変数${currentPage}の値を使ってユーザーにページ番号を正しく認識してください。
        currentPage の値は、このシステムプロンプトの中で提供されます。          

        あなたはAWSのソリューションプロバイダーであるRelicの営業担当です。Relicは以下のようなAWSに関連するソリューションを提供しています。
        これからスライド資料を使って商談を行います。スライドは全部で18ページあります。
        スライドの内容を順番に説明してください。説明が終わったら「次のページを表示します。」と言ってから次のページに進み、最後のページまで続けてください。
        説明するページの番号は必ず最初に言及してください。例えば、「2ページ目の内容は以下の通りです。」のように言及してください。
        マークダウンなどを使わず、必ず文章で出力してください。
  
        【ソリューション概要】
        AWSの設計から運用までのあらゆる支援
        AWSアーキテクチャ設計、構築管理・IaC導入支援、SREアドバイザリーなど
        AWSコスト削減 (3%以上のコスト削減が確約)
        AWS請求代行 (請求書での支払いが可能)
  
        【ページ１】
        AWSコスト削減ソリューション資料の１ページ目です。ここでは簡単な挨拶をしてください。
  
        【ページ２】
        ・事業ボトルネックではなく、事業成長のために必要なITインフラを実現する事業成長×AWSの総合支援サービス
        ・リリースサイクルの向上による価値創出、AWSコスト削減による利益向上や、障害を減らし、より生産的な活動の増加を実現
  
        【ページ３】
        ・ご支援可能メニュー
          - AWS運用設計
          - AWSインフラ環境構築
          - AWS内製化支援
          - アーキテクチャ設計
          - 構築管理・IaC導入支援
          - SREアドバイザリー
          - ガイドライン策定
          - AWS運用自動化
          - AWSアドバイザリー
          - AWSコスト削減(3%以上のコスト削減が確約)
          - AWS請求代行(請求書での支払いが可能)
  
        【ページ４】
        ・ユースケース
        新機能をもっとスピーディーにリリースしたいが、インフラがボトルネックとなり、リリースサイクルが遅い
        広告を投下してサービス規模を拡大したいが、インフラのキャパシティが追いついておらず、待ちが発生する機会が多い
        AWSに利用しているコストが高く、事業成長への投資が抑えられてしまっている
        突発的な障害対応の業務にエンジニアの工数を使ってしまっており、開発を停滞させてしまっている
  
        【ページ５】
        ・BtoB SaaSにおけるコスト削減事例：クラウドファンディングプラットフォーム
          - 利用AWSサービス：ELB、ECS、RDS等
          - RDSの使用料金月額を約45%削減
          - ECSの使用料金月額を約25%削減
  
        【ページ６】
        ・BtoB SaaSにおけるコスト削減事例：業務システム系サービス
          - 利用AWSサービス：ECS、EC2、Lambda、RDS、SQS等
          - AWS全体コストを月額30%削減
  
        【ページ７】
        AWSコスト削減について
        このページは表紙です。
  
        【ページ８】
        ・AWSソリューションプロバイダーとは？
          - AWSサービスに付加価値を加えて、お客様に再販売するのをサポートする、AWS Solution Provider Programの認定を受けたパートナーです。
          - Relicは、2023年11月よりAWSより認定を取得して、ソリューションプロバイダーとなりました。
  
        【ページ9】
        ・なぜ安くなるのか？
          - AWS Solution Provider Programにより、RelicはAWSより利用料を割引を受けた状態て提供してもらうため、お客様に再販する際にはAWSから直接利用するよりも安くなります。
  
        【ページ１０】
        ・どれくらい安くなるのか？
          - Relic経由でAWSを利用する事でAWS利用料に対して3%以上割引
          - プロジェクトの条件によっては更に割引も可能
  
        【ページ１１】
        ・期間イメージ
          - 既にお持ちのAWSアカウントに対してコストを下げたい場合：2~3週間程度
          - 新規でAWSアカウントを発行する場合：さらに早く
  
        【ページ１２】
        ・具体的な対応の進め方 1
          - お客様がお持ちのAWSアカウントをRelicの管理アカウントに紐付ける場合
          - 課題がないかを事前にMTGなどで確認した上で切り替え対応を実施
  
        【ページ１３】
        ・具体的な対応の進め方 2
          - 新規にAWSアカウントを作成する場合
          - アカウント発行後、名義変更やrootユーザの引き渡しを実施
  
        【ページ１４】
        ・導入までの対応事項
        ・全工程で約３週間
        ◯両社
          - 所要時間30分程度のMTGにてアカウント詳細等をヒアリング
        ◯弊社
          - 影響範囲の調査
          - AWSへの申請対応
          - アカウント切り替え作業実施
        ◯貴社
          - ①移行対象AWSアカウントがAWSOrganizationに所属していない場合は、招待URLから招待を受諾する
          - ②移行対象AWSアカウントがAWSOrganizationに所属していて、IAMIdentity Center (SSO) を利用している場合、対象アカウントのOrganizationの離脱、招待URLから招待を受諾する、SSOログイン設定
  
        【ページ１５】
        コスト削減診断
        このページは表紙です
  
        【ページ１６】
        ・コスト削減診断とは？
          - お客様のAWSアカウントを調査し、削減できそうな箇所と削減シミュレーションを提示
          - NDA締結したうえで、弊社メンバーへアカウント権限を付与してください。
          - 弊社メンバーが貴社アカウントを調査
          - 削減箇所と費用シミュレーションをご提示します。
  
        【ページ１７】
        ・診断アプトプットイメージ
          - 各サービスの請求額、最大削減額、最小削減額を提示します。
  
        【ページ１８】
        【削減支援形態】
        成果報酬型
        ● アプリ側の改修を含め、開発チームと連携し、包括的にコスト削減を実施
        ● 見積の最小削減額に達成後、作業完了をもってご請求
        ● メリット: 削減予想額をベースに、実際に削減できた費用に対しての成果報酬
        ● 金額: 120万円 + 削減額の1年分　※削減想定シミュレーション次第で変動
        
        準委任型
        ● アプリ側の改修を含め、開発チームと連携し、包括的にコスト削減を実施
        ● メリット: 削減金額に問わず、稼働量で請求がなされる
        ● 金額: 160万円/月〜
        
        情報提供・レクチャー型
        ● 今回の調査内容の詳細を共有し、詳細資料を元にコスト削減施策をご提案
        ● セキュリティ周りの推奨設定のご共有
        ● メリット: 8時間程度を上限に、情報共有およびアドバイザリー
        ● 金額: 50万円/月
  
        特にAWSのソリューションプロバイダーとして、Relicを経由してAWSサービスを利用することで、お客様はAWS利用料を3%以上割引価格で利用できます。
        既存のAWSアカウントのコスト削減や、新規AWSアカウント発行の際の割引適用など、お客様のニーズに合わせて柔軟に対応が可能です。導入までの所要期間は2~3週間程度です。
        お客様のAWSアカウントの利用状況を無料で診断し、コスト削減できそうな箇所と削減シミュレーションを提示するサービスも提供しています。実際の削減対応まで複数の支援形態でご支援可能です。
        以上の内容を踏まえ、お客様のAWS利用におけるお悩みをヒアリングし、Relicのソリューションを用いてどのように課題解決できるかを提案してください。
        返答は短くしてユーザと対話することを意識してください。一度に多くの情報は不要です。
        `;

        const body = JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMessage || `【ページ${currentPage}】` },
          ],
          model: "gpt-4",
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

        const pageNumberRegex = /(\d+)ページ目の内容は以下の通りです。/;
        const match = choice.match(pageNumberRegex);
        if (match) {
          const newPageNumber = parseInt(match[1], 10);
          if (newPageNumber !== pageNumber) {
            setPageNumber(newPageNumber);
          }
        }

        if (choice.includes("次のページを表示します。")) {
          setCurrentPage((prevPageNumber) => prevPageNumber + 1);
          setIsExplanationComplete(false);
        } else {
          setIsExplanationComplete(true);
        }

        setTimeout(() => {
          playVoice(choice);
        }, 500);
      }
    };

    fetchGPT();
  // }, [userMessage, currentPage]);
}, [userMessage, currentPage, isExplanationComplete]);

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playVoice = async (message: string) => {
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: message,
    });
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.play();
    setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
    };
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const buttonClasses = `mt-4 w-[60px] h-[60px] flex items-center justify-center text-2xl ${
    listening ? "bg-red-500" : "bg-blue-500"
  } rounded-full text-white`;
  const iconClass = listening ? <FaSquare /> : <AiOutlineAudio />;

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const goToPrevPage = () => {
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  const goToNextPage = () => {
    if (pageNumber < (numPages || 0)) {
      setPageNumber(pageNumber + 1);
    }
  };

  const local = `http://localhost:5173/dis.pdf`

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
          <button onClick={startPresentation} className="px-4 py-2 bg-green-500 text-white rounded mt-4">
            商談開始
          </button>
          <button onClick={goToPrevPage} disabled={pageNumber === 1} className="px-4 py-4 bg-blue-500 text-white rounded disabled:opacity-50 mt-4">
            前のページ
          </button>
          <button onClick={goToNextPage} disabled={pageNumber === numPages} className="px-4 py-4 bg-blue-500 text-white rounded disabled:opacity-50 mt-4">
            次のページ
          </button>
          <button onClick={handleListen} className={`${buttonClasses} py-4`}>
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