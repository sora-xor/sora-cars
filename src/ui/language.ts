import { LIVERIES, TRACKS } from '../game/rules';

/** Japanese-first interface labels; English stays visible as a subtitle. */
const labels: Readonly<Record<string, string>> = {
  'Live arcade racing view': 'アーケードレース画面', 'SORA CARS home': 'SORA CARSのホーム',
  'EXPORT VERIFICATION FILES': '検証用ファイルを書き出す',
  'This session does not stake the XOR asset pinned by this release.': 'この対戦のステークは、リリースが指定したXOR資産と一致しません。',
  'This session does not use the network pinned by this release.': 'この対戦は、リリースが指定したネットワークと一致しません。',
  'FIND YOUR GRID.': '仲間のグリッドへ。',
  'Open a session from the lobby or paste its invitation link.': 'ロビーから対戦を開くか、招待リンクを貼り付けてください。',
  'Export stopped before completion. Any partial files are unverified.': '書き出しは完了前に停止しました。途中まで保存したファイルは未検証です。',
  'Finality export exceeds the 65,536-height work budget.': '確定履歴が、この書き出しの上限65,536ブロックを超えています。',
  'Main navigation': 'メインメニュー', 'Open settings': '設定を開く', 'Pause race': 'レースを一時停止',
  'Toggle music': '音楽を切り替える', 'Turn music on': '音楽をオンにする', 'Turn music off': '音楽をオフにする',
  'Steer left': '左にハンドルを切る', 'Steer right': '右にハンドルを切る', 'Export replay': 'リプレイを書き出す',
  'SORA flag': 'SORAの旗', 'Wallet pairing QR code': 'ウォレット接続用QRコード',
  'HAKONE · JAPAN': '日本・箱根', 'YOKOHAMA · JAPAN': '日本・横浜', 'NIKKO · JAPAN': '日本・日光',
  'ACCELERATE': '加速', 'SPECTATING / 観戦': '観戦中', 'FOLLOW NEXT CAR': '次の車を追う', 'EXIT': '退出',
  'SESSION': '対戦ルーム', 'SESSION / CONNECTIONS': '対戦と接続', 'Verifying the public feed…': '観戦データを検証中…',
  'Connecting to the grid…': 'グリッドに接続中…', 'TAKE A BREATHER / 休憩': 'ひと休みしよう',
  'IROHA CONNECT / 接続': 'ウォレットを接続', 'CONNECT YOUR WALLET.': 'ウォレットをつなごう。',
  'SCAN TO CONNECT.': 'スキャンして、つながろう。',
  'Scan with an Iroha Connect wallet set to Taira testnet.': 'Tairaテストネットに設定したIroha Connect対応ウォレットで読み取ってください。',
  'Connection approved. Purchases and race entries need separate wallet approval.': '接続が承認されました。購入や対戦への参加は、その都度ウォレットで承認します。',
  'CONNECTION UNAVAILABLE.': '接続できませんでした。',
  'Could not complete the wallet connection. Retry or choose another Taira endpoint in settings.': 'ウォレット接続を完了できませんでした。再試行するか、設定から別のTaira接続先を選んでください。',
  'TRY AGAIN': 'もう一度接続する',
  'Preparing a secure wallet connection…': 'ウォレット接続を準備中…', 'SCAN. CONNECT. DRIVE.': 'つながったら、走り出そう。',
  'OPEN WALLET': 'ウォレットを開く', 'Approve the connection in your wallet. Your keys stay there.': 'ウォレットで接続を承認してください。秘密鍵はウォレットに保持されます。',
  'WALLET CONNECTION': 'ウォレット接続', 'STILL AT THE START.': '接続の準備をしよう。', 'GOT IT': 'わかった',
  'CONNECTED WALLET': '接続中のウォレット', 'READY TO RACE.': '走る準備はできた。', 'DISCONNECT': '接続を解除',
  'Native proof and settlement support are available.': '結果の証明と精算を利用できます。',
  'FORFEIT': '失格', 'TECHNICAL WIN': '不戦勝', 'PRACTICE': '練習', 'MULTIPLAYER': '対戦',
  'Practice session · No XOR was staked or awarded.': '練習走行・XORの預け入れや賞金はありません。',
  'Certified simulation result · XOR settlement still requires an accepted native execution proof.': '署名済みの走行結果・XORの精算には、受理された実行証明が必要です。',
  'Replay of a multiplayer session · This view does not authenticate ledger settlement.': '対戦のリプレイ・この画面では台帳の精算を検証していません。',
  'PRACTICE COMPLETE / お疲れ様でした': '練習終了・お疲れ様でした',
  'LIVE RACE COMPLETE / お疲れ様でした': '対戦終了・お疲れ様でした',
  'REPLAY COMPLETE / お疲れ様でした': 'リプレイ終了・お疲れ様でした',
  'THE GARAGE / 六台のマシン': 'ガレージ・6色のマシン', 'PIT WALL / 設定': 'ピットの設定',
  'MULTIPLAYER / 対戦': 'みんなと対戦', 'YOUR SESSIONS / 記録': 'これまでの走り',
  'Reading native race availability from Taira.': 'Tairaの対戦準備を確認しています。',
  'Original 1980s Japanese electronic-inspired MIDI compositions. Synthesized locally, without streaming.': '1980年代の日本の電子音楽に着想を得た、オリジナルMIDI楽曲。端末内で演奏します。',
  'Midnight Transistor': '真夜中のトランジスタ', 'Harbor Signals': '港のシグナル', 'Sakura Express': '桜エクスプレス',
  'Car colors': '車体カラー',
  'R2 gas · L2 brake · A boost · B drift': 'R2 加速・L2 ブレーキ・A ブースト・B ドリフト',
  'Touch controls appear on mobile. Gamepads connect automatically.': 'スマートフォンではタッチ操作を表示。ゲームパッドは接続すると使えます。',
  'Endpoints provide transport. Native Iroha verifies race proofs and settles XOR. This build requires a release-pinned network identity before wallet signing.': '接続先は通信を中継し、Irohaが結果の証明とXORの精算を検証します。ウォレット署名には、リリースが指定したネットワーク設定が必要です。',
  'CONNECT WALLET': 'ウォレット接続', 'MUSIC OFF': '音楽 オフ', 'MUSIC ON': '音楽 オン',
  'SETTINGS': '設定', 'THE ROAD IS YOURS.': 'この道は、君のもの。',
  'THE JAPANESE ARCADE RACING CLUB': 'SORAで走る、日本のアーケードレース',
  'TONIGHT’S CIRCUIT / 01': '今夜のコース / 01', 'TONIGHT’S CIRCUIT / 02': '今夜のコース / 02', 'TONIGHT’S CIRCUIT / 03': '今夜のコース / 03',
  'Six colors. The same street-spec machine.': '6色のマシン、同じストリートクラス。', 'Your line makes the difference.': '勝負を決めるのは、君のライン。',
  'ENGINE': 'エンジン', 'DRIVETRAIN': '駆動方式', 'CLASS': 'クラス', 'STRAIGHT SIX · TURBO': '直列6気筒・ターボ', 'REAR WHEEL DRIVE': '後輪駆動',
  'STREET SPEC · EQUAL PERFORMANCE': 'ストリートクラス・性能統一', 'TAKE IT FOR A SPIN': '試しに走ろう',
  'CIRCUIT': 'コース', 'GRID SIZE': '参加人数', 'ENTRY STAKE': '参加ステーク', 'DRIVERS': 'ドライバー', 'POT': '賞金', 'RACE': 'レース',
  'REFRESH': '更新', 'CREATE A RACE': 'レースを作る', 'PRACTICE WHILE YOU WAIT': '待ちながら練習', 'LIVE RACE COMPLETE': '対戦終了', 'PRACTICE COMPLETE': '練習終了', 'REPLAY COMPLETE': 'リプレイ終了',
  'Real drivers. Shared roads. XOR on the finish line.': '同じ道を、本物のライバルと。ゴールの先にXOR。',
  'Live races appear here when the network is ready.': 'ネットワークが準備できると、対戦がここに表示されます。',
  'CHECKING THE STARTING LIGHTS': 'スタートの準備を確認中', 'XOR RACING IS NOT LIVE YET': 'XOR対戦は準備中です', 'STARTING LIGHTS READY': '対戦の準備ができました',
  'Testnet XOR · No house fee · Winner takes the pot · Exact ties split it': 'テストネットXOR・運営手数料なし・優勝者に賞金・同着は分配',
  'IMPORT REPLAY': 'リプレイを読み込む', 'Every corner, every overtake. Run it back.': 'すべてのコーナー、すべての追い越し。もう一度。',
  'YOUR STORY STARTS ON THE ROAD.': '君の物語は、道から始まる。', 'Finish a practice session to save your first replay.': '練習を完走すると、最初のリプレイが保存されます。', 'START DRIVING': '走り始める',
  'REPLAY': 'リプレイ', 'SOUND SYSTEM': 'サウンド', 'MUSIC': '音楽', 'ENGINE & EFFECTS': 'エンジン音・効果音', 'DRIVER CONTROLS': '操作方法',
  'ACCELERATE / BRAKE': '加速・ブレーキ', 'STEER': 'ハンドル', 'DRIFT': 'ドリフト', 'BOOST': 'ブースト', 'TURBO': 'ターボ', 'BRAKE': 'ブレーキ', 'GAS': 'アクセル',
  'PAUSE / FULLSCREEN': '一時停止・全画面', 'GAMEPAD': 'ゲームパッド', 'NETWORK': 'ネットワーク', 'TORII ENDPOINT': 'Torii接続先', 'SAVE ENDPOINT': '接続先を保存',
  'IN THE PITS.': 'ピットでひと休み。', 'BACK TO THE ROAD': 'レースに戻る', 'RESTART SESSION': '最初から走る', 'LEAVE RACE': 'レースを離れる',
  'RUN IT BACK': 'もう一度走る', 'WATCH REPLAY': 'リプレイを見る', 'SESSION & SETTLEMENT': '対戦と賞金精算',
  'MAXIMUM TRANSACTION FEE': '取引手数料の上限', 'OPEN SLOT': '空き枠', 'WAITING': '待機中', 'JOINED': '参加済み', 'YOU': 'あなた',
  'INPUT KEY INACTIVE': '入力キー停止中', 'INVITE': '招待する', 'START SESSION': '対戦開始', 'CONNECT TO THE GRID': 'グリッドへ接続', 'WATCH LIVE': '対戦を観る',
  'EXPORT PUBLIC REPLAY': '公開リプレイを書き出す', 'CREATE REMATCH': '再戦を作る', 'ENDPOINT-REPORTED STATE': '接続先が報告した状態',
  'Independent finality verification pending': '独立した確定検証は未完了', 'PEER CONNECTION & RECOVERY': '接続と対戦の復旧',
  'SIGNALING RELAY': 'シグナリング中継', 'CONNECT RELAY': '中継へ接続', 'NAT TRAVERSAL SERVERS (OPTIONAL)': 'NAT越えサーバー（任意）',
  'Route peer traffic through TURN only': '対戦通信をTURN中継だけに限定する', 'PEER SLOT': '相手の参加枠', 'CREATE SIGNED OFFER': '署名付き接続情報を作る',
  'SIGNED OFFER OR ANSWER': '署名付き接続情報・応答', 'ACCEPT CONNECTION DATA': '接続情報を受け取る', 'OPEN DISPUTE': '対戦の復旧を申し立てる',
  'SUBMIT CERTIFIED CHECKPOINT': '合意済み地点を送信', 'ADVANCE DEADLINE': '期限の進行を要求', 'EXPIRE UNSTARTED SESSION': '未開始の対戦を終了',
  'BACK UP GAMEPLAY KEY': '操作キーをバックアップ', 'RESTORE GAMEPLAY KEY': '操作キーを復元', 'LOAD CERTIFIED REPLAY': '署名済みリプレイを読み込む',
  'COMMIT MY INPUTS': '自分の操作を確約', 'RELAY MATCHING ROUND EVIDENCE': '一致する操作証拠を中継', 'SIX INPUT WORDS': '6ティック分の操作値',
  'SELECTING THE CERTIFIED FRONTIER': '合意済み地点を選択中', 'COMMIT THE NEXT SIX TICKS': '次の6ティックを確約', 'REVEAL ACCEPTED CONTROLS': '確約した操作を公開',
  'PRIZE TRANSFERS / 賞金': '賞金の送金', 'PAY ORIGINAL WALLET': '元のウォレットへ送金', 'MY PAYOUT DESTINATION': '自分の賞金の受取先', 'AMOUNT TO TRANSFER': '送金する金額', 'AUTHORIZE MY PAYOUT': '賞金の送金を承認',
  'NATIVE RESULT PROOF': 'ネイティブ結果証明', 'INDEPENDENT VERIFICATION': '独立した検証', 'CHECK THE FINISH.': 'ゴールを確かめよう。',
  "Torii did not return JSON.": "ToriiからJSON形式の応答がありません。",
  "Torii returned an empty body.": "Toriiの応答が空です。",
  "Torii response exceeds the bounded read limit.": "Toriiの応答が読み込み上限を超えています。",
  "Torii requires HTTPS outside localhost and cannot contain credentials.": "ローカル環境以外のTorii接続には、認証情報を含まないHTTPSのURLが必要です。",
  "Torii URL must be an origin.": "ToriiのURLには、パスや検索条件を含めず接続先だけを指定してください。",
  "A release-pinned Taira network identity is required for wallet signing.": "ウォレット署名には、このリリースが指定したTairaネットワーク設定が必要です。",
  "Malformed native racing capability response.": "対戦機能の応答形式を確認できません。",
  "The node does not advertise the native game-session V1 interface.": "接続先は、ゲーム対戦V1の機能を提供していません。",
  "This build has no release-pinned Taira network identity; signing remains disabled.": "このビルドには承認済みTairaネットワーク設定がないため、署名できません。",
  "Endpoint network identity differs from this release.": "接続先のネットワークが、このリリースの指定と一致しません。",
  "This release’s native execution proof profile is not qualified. XOR stakes are disabled.": "実行証明の承認が完了していないため、XORをかける対戦は利用できません。",
  "This endpoint cannot yet carry complete execution proof transactions. XOR stakes are disabled.": "接続先が完全な実行証明の取引を送れないため、XORをかける対戦は利用できません。",
  "Wallet connection requires the release-pinned network identity.": "ウォレット接続には、このリリースが指定したネットワーク設定が必要です。",
  "Wallet connection was cancelled.": "ウォレット接続を取り消しました。",
  "Wallet approval belongs to a closed session.": "このウォレット承認の接続は、すでに終了しています。",
  "Wallet session closed.": "ウォレットとの接続が終了しました。",
  "Approve the wallet connection first.": "先にウォレット接続を承認してください。",
  "The native execution profile or transaction transport is not ready; stake and settlement signing is disabled.": "実行証明または取引通信の準備が整っていないため、参加と精算の署名は利用できません。",
  "Wallet session changed during signing.": "署名中にウォレット接続が変わりました。",
  "This release has not qualified live staked sessions.": "このリリースでは、XORをかける対戦の承認が完了していません。",
  "Enter an exact positive XOR stake.": "参加ステークに、0より大きい正確なXOR金額を入力してください。",
  "This release has no pinned XOR asset definition.": "このリリースには、承認済みXOR資産の設定がありません。",
  "Enter a positive exact maximum fee.": "手数料の上限に、0より大きい正確な金額を入力してください。",
  "Invalid private session invitation.": "非公開対戦の招待が無効です。",
  "Missing session ID.": "対戦IDがありません。",
  "Leave your current live session before opening a different grid.": "別の対戦を開く前に、現在の対戦から退出してください。",
  "This session does not use the application and proof profile pinned by this release.": "対戦のアプリケーションと証明設定が、このリリースの指定と一致しません。",
  "The endpoint reports a native dispute. Authenticate the selected checkpoint before resuming.": "接続先は対戦の復旧処理を報告しています。再開前に、選択された合意地点を検証してください。",
  "This browser needs the gameplay key authorized by your joined wallet.": "参加したウォレットが承認した操作キーを、このブラウザーに復元してください。",
  "Load the public replay matching the selected checkpoint before resuming.": "再開前に、選択された合意地点に一致する公開リプレイを読み込んでください。",
  "This session has inactive input keys. Continue through the native forced rounds or submit its terminal proof.": "停止した操作キーがあります。台帳の操作ラウンドを進めるか、終了結果の証明を送信してください。",
  "Unsupported session epoch.": "対応していない対戦ラウンドです。",
  "Unsupported game epoch.": "対応していないゲームラウンドです。",
  "Load the complete replay through the chain-selected checkpoint.": "台帳が選択した合意地点までの、完全なリプレイを読み込んでください。",
  "Invalid recovery file.": "復旧ファイルが無効です。",
  "Unsupported recovery file version.": "この復旧ファイルのバージョンには対応していません。",
  "Gameplay backup belongs to another network or session.": "操作キーのバックアップは、別のネットワークまたは対戦のものです。",
  "This gameplay key is not authorized in the native roster.": "この操作キーは、対戦の参加者一覧で承認されていません。",
  "Load a SORA CARS public replay bundle.": "SORA CARSの公開リプレイを読み込んでください。",
  "Public replay belongs to another game scope.": "公開リプレイは、別のゲーム設定のものです。",
  "Replay does not match the selected game.": "リプレイが選択中の対戦と一致しません。",
  "Oversized recovery evidence.": "復旧証拠がサイズ上限を超えています。",
  "This private grid does not publish a spectator feed.": "この非公開対戦では、観戦配信を公開していません。",
  "Enter the public session’s signaling relay in Peer connection & recovery.": "「接続と対戦の復旧」に、公開対戦のシグナリング中継を入力してください。",
  "Your gameplay connection is already active.": "操作用の接続は、すでに有効です。",
  "The endpoint did not report a valid current block height.": "接続先から、有効な現在のブロック高が返されませんでした。",
  "A release-pinned XOR asset definition is required.": "このリリースが指定したXOR資産の設定が必要です。",
  "This release must pin the game application and execution profile.": "リリースで、ゲームアプリケーションと実行証明の設定を指定する必要があります。",
  "No outstanding payout for this driver.": "このドライバーに未送金の賞金はありません。",
  "Only the winning wallet can redirect its payout.": "賞金の受取先を変更できるのは、受賞したウォレットだけです。",
  "Use the private invitation link for this session.": "この対戦の非公開招待リンクを使用してください。",
  "Connect to the grid first.": "先に対戦のグリッドに接続してください。",
  "This browser does not have the private invitation capability.": "このブラウザーには、非公開対戦の招待情報がありません。",
  "Load this session’s complete public replay before requesting a proof.": "証明を依頼する前に、この対戦の完全な公開リプレイを読み込んでください。",
  "Wait for the current public proving job.": "現在の公開証明処理が終わるまでお待ちください。",
  "Load a native execution proof first.": "先にネイティブ実行証明を読み込んでください。",
  "No gameplay key is stored for this session.": "この対戦の操作キーが保存されていません。",
  "Your authorized gameplay key is required to open a dispute.": "復旧を申し立てるには、承認済みの操作キーが必要です。",
  "Load a checkpoint signed by all original racers.": "最初の参加者全員が署名した合意地点を読み込んでください。",
  "Use the actions for the current forced input phase, or submit a terminal execution proof.": "現在の操作ラウンドの手順を進めるか、終了結果の実行証明を送信してください。",
  "No missing evidence matches the current native input round.": "現在の操作ラウンドに対応する未提出の証拠はありません。",
  "Enter six canonical control words between 0 and 63.": "0〜63の正規の操作値を、6個入力してください。",
  "Restore your authorized gameplay key.": "承認済みの操作キーを復元してください。",
  "This round already has your committed inputs. Reveal the original controls.": "このラウンドの操作はすでに確約済みです。元の操作を公開してください。",
  "This browser cannot retain the reveal. Enable session storage before committing a forced input round.": "このブラウザーでは公開用の操作を保存できません。操作を確約する前にセッション保存を有効にしてください。",
  "No certified checkpoint is ready.": "全員が署名した合意地点は、まだありません。",
  "Recovery file exceeds the 2 MiB import bound.": "復旧ファイルが読み込み上限の2 MiBを超えています。",
  "Proof statement matches this session. Native validators must still verify the execution proof before payout.": "証明の公開条件は、この対戦と一致しています。賞金精算には、検証ノードによる実行証明の検証が必要です。",
  "No open sessions yet. Create the next grid.": "募集中の対戦はありません。次のグリッドを作りましょう。",
  "per driver": "ドライバー1人あたり",
  "NEW SESSION / 集合": "新しい対戦",
  "DRIVERS’ MEETING / 集合": "ドライバーズミーティング",
  "PUBLIC GRID": "公開対戦",
  "PRIVATE INVITATION": "非公開の招待",
  "Creating the session reserves the rules. Joining it is a separate wallet transaction that places your exact stake in escrow.": "対戦を作るとルールが固定されます。参加時には別のウォレット取引で、指定した金額を保護口座に預けます。",
  "This wallet-approved fee limit is separate from your entry stake. It is a maximum, not a fee estimate.": "この手数料上限は、参加ステークとは別にウォレットで承認します。見積額ではなく、請求可能な上限です。",
  "An optional relay exchanges signed connection offers. Use manual offers if it is unavailable.": "任意の中継で、署名付き接続情報を交換できます。利用できない場合は、接続情報を直接交換してください。",
  "THE FINISH LINE / 結果": "ゴールの結果",
  "A native Iroha execution proof checks the complete accepted simulation. Any prover can process the public replay; no wallet keys are included.": "Irohaの実行証明が、受理された操作によるシミュレーション全体を検証します。公開リプレイは誰でも証明でき、ウォレットの鍵は含みません。",
  "RECORD CERTIFIED FINISH": "署名済みの終了地点を記録",
  "EXPORT PROVING REQUEST": "証明依頼を書き出す",
  "LOAD NATIVE PROOF": "ネイティブ証明を読み込む",
  "SUBMIT PROOF & SETTLE": "証明を送信して精算",
  "OPTIONAL PROOF WORKER": "証明ワーカー（任意）",
  "PROVE PUBLIC REPLAY": "公開リプレイを証明",
  "Use your own worker, or export the request for the native CLI.": "自分のワーカーを使うか、ネイティブCLI向けに証明依頼を書き出してください。",
  "VERIFY FINALIZED SETTLEMENT": "確定した精算を検証",
  "EXPECTED SETTLEMENT ENTRY HASH": "期待する精算取引のハッシュ",
  "EXPECTED OUTCOME HASH": "期待する結果のハッシュ",
  "SETTLEMENT BLOCK HEIGHT": "精算のブロック高",
  "DOWNLOAD VERIFICATION BUNDLE": "検証データをダウンロード",
  "NATIVE VERIFICATION COMMAND": "ネイティブ検証コマンド",
  "Download the finalized ledger carriers, then verify the settlement and its execution proof with the native CLI. Downloads and endpoint reports do not establish finality.": "確定検証用の台帳データをダウンロードし、ネイティブCLIで精算と実行証明を検証してください。ダウンロードや接続先の報告だけでは、確定を確認できません。",
  "The block height is a lookup hint. Native inclusion verification must confirm the expected successful settlement.": "ブロック高は検索の手がかりです。期待する精算が成功して含まれていることを、ネイティブ検証で確認してください。",
  "This development build has no reviewed finalized network context. Bundle verification becomes available in a release with an independently pinned context.": "この開発ビルドには、承認済みのネットワーク確定情報がありません。独立して検証した情報を指定したリリースで、検証データを利用できます。",
  "The bundle contains untrusted ledger carriers. Run this command with the reviewed native Iroha binary; it verifies the pinned finality chain, successful settlement inclusion and execution proof.": "このデータは、まだ信頼性を検証していません。承認済みのIroha実行ファイルでコマンドを実行し、指定した確定チェーン、精算の成功と収録、実行証明を検証してください。",
  "No browser verification verdict has been issued.": "ブラウザーによる検証結果は、まだ出ていません。",
  "The worker returned a proof matching this session. Review and submit it for native settlement.": "ワーカーから、この対戦に一致する証明が届きました。内容を確認し、ネイティブ精算に送信してください。",
  "The proof worker failed. Export the public request to try another prover.": "証明ワーカーの処理に失敗しました。公開依頼を書き出し、別の証明者で試してください。",
  "The endpoint reports these fixed awards. An outstanding amount remains in protected escrow until its transfer succeeds; settlement alone does not mean the wallet has received it.": "接続先は、これらの確定賞金を報告しています。未送金額は送金に成功するまで保護口座に残ります。精算済みでも、ウォレットへの入金済みとは限りません。",
  "TRANSFER COMPLETE": "送金完了",
  "Anyone may retry an original-wallet payment. Only its wallet owner may choose a different registered destination or authorize a partial payment. Asset transfer restrictions still apply. Transaction fees are shown separately above.": "元のウォレットへの送金は、誰でも再試行できます。別の登録済み受取先や一部送金を承認できるのは、その所有者だけです。資産の送金制限は引き続き適用されます。手数料は上に別表示しています。",
  "Configure your own STUN/TURN service before connecting across networks. Credentials stay in this tab and are excluded from invitations and replays. Existing connections keep their current settings.": "異なるネットワーク間で接続する前に、STUN/TURNサービスを設定してください。認証情報はこのタブだけに保持し、招待やリプレイには含みません。既存の接続は現在の設定を維持します。",
  "A peer dispute needs a native deadline decision. Your certified inputs and checkpoint are retained.": "対戦の復旧には、台帳による期限の判断が必要です。署名済みの操作と合意地点は保持しています。",
  "Authorized gameplay key restored for this session.": "この対戦の承認済み操作キーを復元しました。",
  "Add control values: gas 1, brake 2, left 4, right 8, drift 16, boost 32. One word per simulated tick. Example: gas + right = 9.": "操作値を足してください：加速1、ブレーキ2、左4、右8、ドリフト16、ブースト32。1ティックに1個の値です。例：加速＋右＝9。",
  "Submit your latest certificate and pending commitment set before the selection deadline. Controls become admissible only after the ledger selects that frontier.": "選択期限までに、最新の証明書と保留中の操作確約を送信してください。台帳が再開地点を選ぶと、その操作が受理対象になります。",
  "Load a signed public replay from a racer to join this feed in progress.": "途中から観戦するには、参加者から署名済み公開リプレイを読み込んでください。",
  "Private invitation copied. Anyone with this link can join an open slot.": "非公開の招待をコピーしました。このリンクを持つ人は、空き枠に参加できます。",
  "Session link copied.": "対戦リンクをコピーしました。",
  "Public proving job accepted by the worker.": "ワーカーが公開リプレイの証明依頼を受け付けました。",
  "Wallet connected.": "ウォレットを接続しました。",
  "Network endpoint saved.": "ネットワーク接続先を保存しました。",
  "Leave your live session before starting another drive.": "別の走行を始める前に、現在の対戦から退出してください。",
  "Replay storage is full. Export this session from the results.": "リプレイの保存領域がいっぱいです。結果画面から、この対戦を書き出してください。",
  "Replay exceeds the 1 MiB limit.": "リプレイが1 MiBの上限を超えています。",
  "Close": "閉じる",
  "Previous track": "前のコース",
  "Next track": "次のコース",
  "lobby": "参加受付中",
  "racing": "対戦中",
  "selecting checkpoint": "合意地点を選択中",
  "forced commit": "操作を確約中",
  "forced reveal": "操作を公開中",
  "awaiting proof": "証明待ち",
  "settled": "精算済み",
  "cancelled": "取消済み",
  'WHO CAN JOIN?': '参加できる人', 'BUILD YOUR GRID.': '仲間を集めよう。', 'CREATE SESSION': '対戦を作る',
  'Establishing authenticated connections with the native race roster.': '対戦参加者と、署名を確認した接続を確立しています。',
  'Waiting for every active racer to certify the input batch.': '有効な参加者全員による、操作の合意を待っています。',
  'Certifying the exact initial simulation state.': 'シミュレーションの開始状態を全員で確認しています。',
  'Initial state certified. Inputs are signed by the race-scoped gameplay keys.': '開始状態を確認しました。操作は、この対戦専用の操作キーで署名されます。',
  'Every active racer certified the terminal transcript. Native execution proof settlement is next.': '有効な参加者全員が終了記録に合意しました。次は、実行証明による精算です。',
  'Authenticated race in progress.': '署名を確認した対戦を進行中です。',
  'Peer session closed. The native escrow lifecycle remains on-chain.': '対戦通信を終了しました。預けた資産の処理は、引き続き台帳上で進みます。',
  'Initial state independently verified against every active racer signature.': '有効な参加者全員の署名と、開始状態が一致することを検証しました。',
  'This live feed needs a signed checkpoint and its matching replay to join in progress.': '途中からの観戦には、署名済みの合意地点と一致するリプレイが必要です。',
};

/** Translate only known interface text; external data is never interpreted as HTML. */
export function interfaceTranslation(original: string): { japanese: string; english: string } | null {
  const exact = Object.hasOwn(labels, original) ? labels[original] : undefined;
  if (exact) return { japanese: exact, english: original };
  const named = [...TRACKS, ...LIVERIES].find(item => item.name === original);
  if (named) return { japanese: named.japanese, english: original };
  const bilingual = /^(.+?) \/ ([\s\S]+)$/u.exec(original);
  if (bilingual && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(bilingual[1]!)) {
    return { japanese: bilingual[1]!, english: bilingual[2]! };
  }
  let match: RegExpExecArray | null;
  if ((match = /^Select (.+)$/u.exec(original))) {
    const item = [...TRACKS, ...LIVERIES].find(value => value.name === match![1]);
    if (item) return { japanese: `${item.japanese}を選ぶ`, english: original };
  }
  if ((match = /^([2-8]) racers$/u.exec(original))) return { japanese: `${match[1]}人`, english: original };
  if ((match = /^REPLAY \/ (PRACTICE|MULTIPLAYER)$/u.exec(original))) return { japanese: `${labels[match[1]!]}のリプレイ`, english: original };
  if ((match = /^(\d{4}\/\d{1,2}\/\d{1,2}) · (PRACTICE|MULTIPLAYER) · (.+)$/u.exec(original))) return { japanese: `${match[1]}・${labels[match[2]!]}・${match[3]}`, english: original };
  if ((match = /^(Midnight Circuit|Harbor Run|Sakura Pass) · (.+)$/u.exec(original))) return { japanese: `${TRACKS.find(track => track.name === match![1])!.japanese}・${labels[match[2]!] ?? match[2]}`, english: original };
  if ((match = /^VOL\. 0([1-3]) · (CLEAR|NEXT|LOCKED)$/u.exec(original))) return { japanese: `第${match[1]}章・${({ CLEAR: 'クリア', NEXT: '次の物語', LOCKED: '未解放' } as Record<string, string>)[match[2]!]}`, english: original };
  if ((match = /^Torii returned HTTP (\d{3}) for (.+)\.$/u.exec(original))) return { japanese: `ToriiからHTTP ${match[1]}が返されました：${match[2]}`, english: original };
  if ((match = /^Downloading unverified carriers: (\d+) \/ (\d+)$/u.exec(original))) return { japanese: `未検証の台帳データを取得中：${match[1]} / ${match[2]}`, english: original };
  if ((match = /^Proof JSON exceeds this release’s ([\d.]+) MiB import bound\.$/u.exec(original))) return { japanese: `証明JSONが、このリリースの読み込み上限${match[1]} MiBを超えています。`, english: original };
  if ((match = /^Endpoint reported transaction acceptance: (.+)\. Independent finality verification is still required\.$/u.exec(original))) return { japanese: `接続先が取引の受理を報告しました：${match[1]}。独立した確定検証が必要です。`, english: original };
  if ((match = /^Deadline: block (\d+)\. The ledger decides deadline advancement and forfeits\. Leaving the page does not refund an active session\.$/u.exec(original))) return { japanese: `期限：ブロック${match[1]}。期限の進行と失格は台帳が判断します。ページを離れても、進行中の対戦は返金されません。`, english: original };
  if ((match = /^Loaded ([\d,]+) proof bytes\. Public statement bindings checked locally; cryptographic verification is pending native execution\.$/u.exec(original))) return { japanese: `${match[1]}バイトの証明を読み込みました。対戦条件との一致を確認しました。暗号学的な検証は、ネイティブ実行待ちです。`, english: original };
  if ((match = /^This release pins a network context at block (\d+)\. Use the settlement entry hash from your wallet and the outcome hash from your proving request\.$/u.exec(original))) return { japanese: `このリリースは、ブロック${match[1]}のネットワーク情報を指定しています。ウォレットの精算取引ハッシュと、証明依頼の結果ハッシュを使用してください。`, english: original };
  if ((match = /^Replay at tick (\d+) matches every original input-key signature\. Ledger finality remains unauthenticated in this browser\.$/u.exec(original))) return { japanese: `ティック${match[1]}のリプレイは、最初の参加者全員の操作キー署名と一致します。このブラウザーでは、台帳の確定は未検証です。`, english: original };
  if ((match = /^Loaded certified public replay: tick (\d+)\.$/u.exec(original))) return { japanese: `署名済み公開リプレイを読み込みました：ティック${match[1]}。`, english: original };
  if ((match = /^Round (\d+) · tick (\d+) · deadline block (\d+)\. Everyone may relay matching public evidence\. Each action requests a separate bounded wallet fee\.$/u.exec(original))) return { japanese: `ラウンド${match[1]}・ティック${match[2]}・期限ブロック${match[3]}。一致する公開証拠は誰でも中継できます。各操作には、個別に上限付きのウォレット手数料承認が必要です。`, english: original };
  if ((match = /^Worker reports: (QUEUED|PROVING|VERIFYING|COMPLETE|FAILED|RUNNING|COMPLETED)(?: · ([\s\S]+))?$/u.exec(original))) {
    const status = { QUEUED: '待機中', PROVING: '証明中', VERIFYING: '検証中', COMPLETE: '完了', FAILED: '失敗', RUNNING: '証明中', COMPLETED: '完了' }[match[1] as 'QUEUED' | 'PROVING' | 'VERIFYING' | 'COMPLETE' | 'FAILED' | 'RUNNING' | 'COMPLETED'];
    return { japanese: `ワーカーからの報告：${status}${match[2] ? `。${interfaceTranslation(match[2])?.japanese ?? '詳細は英語の報告をご確認ください。'}` : ''}`, english: original };
  }
  if ((match = /^JOIN · ([\d.]+) XOR$/u.exec(original))) return { japanese: `参加する・${match[1]} XOR`, english: original };
  if ((match = /^DRIVER (\d+)$/u.exec(original))) return { japanese: `ドライバー${match[1]}`, english: original };
  if ((match = /^([\d.]+) XOR awarded$/u.exec(original))) return { japanese: `賞金 ${match[1]} XOR`, english: original };
  if ((match = /^([\d.]+) XOR OUTSTANDING$/u.exec(original))) return { japanese: `未送金 ${match[1]} XOR`, english: original };
  if ((match = /^(.+) · (LOBBY|RACING|SELECTING CHECKPOINT|FORCED COMMIT|FORCED REVEAL|AWAITING PROOF|SETTLED|CANCELLED) · ([\d.]+) XOR per driver$/u.exec(original))) return { japanese: `${match[1]}・${labels[match[2]!.toLowerCase()]}・1人 ${match[3]} XOR`, english: original };
  if ((match = /^(.+) · (\d+) drivers · ([\d.]+) XOR per driver$/u.exec(original))) return { japanese: `${match[1]}・${match[2]}人・1人 ${match[3]} XOR`, english: original };
  if ((match = /^(Rejected peer packet|Rejected feed packet|Replay rejected|Feed cannot advance): ([\s\S]+)$/u.exec(original))) {
    const heading = { 'Rejected peer packet': '相手の通信を拒否しました', 'Rejected feed packet': '観戦データを拒否しました', 'Replay rejected': 'リプレイを拒否しました', 'Feed cannot advance': '観戦を進められません' }[match[1] as 'Rejected peer packet' | 'Rejected feed packet' | 'Replay rejected' | 'Feed cannot advance'];
    return { japanese: `${heading}。${interfaceTranslation(match[2]!)?.japanese ?? '詳細は英語の報告をご確認ください。'}`, english: original };
  }
  if ((match = /^Racer (\d+): (connecting|open|closed|failed|connected|disconnected)\.$/u.exec(original))) {
    const status = { connecting: '接続中', open: '接続済み', closed: '接続終了', failed: '接続失敗', connected: '接続済み', disconnected: '未接続' }[match[2] as 'connecting' | 'open' | 'closed' | 'failed' | 'connected' | 'disconnected'];
    return { japanese: `ドライバー${match[1]}：${status}`, english: original };
  }
  return null;
}

export function japaneseMessage(english: string): string {
  const translation = interfaceTranslation(english);
  return translation ? `${translation.japanese} / ${translation.english}` : english;
}

/** Keep native diagnostics intact while giving unfamiliar failures a Japanese introduction. */
export function japaneseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const translated = interfaceTranslation(message);
  if (translated) return `${translated.japanese} / ${translated.english}`;
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(message) ? message : `操作を完了できませんでした。詳細をご確認ください。 / ${message}`;
}

export function japaneseInterface(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const pending: { node: Text; original: string; japanese: string; suffix: string }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('[data-bilingual], [lang="en"], script, style, textarea, code, pre')) continue;
    const original = node.textContent?.trim() ?? '';
    const key = original.replace(/\s*[↗→↻↥↑↓＋]+$/u, '').trim(), translated = interfaceTranslation(key);
    if (translated) pending.push({ node, original: translated.english, japanese: translated.japanese, suffix: original.slice(key.length) });
  }
  for (const { node, original, japanese, suffix } of pending) {
    if (node.parentElement?.tagName === 'OPTION') { node.textContent = `${japanese}${suffix} / ${original}`; continue; }
    const wrapper = document.createElement('span'); wrapper.dataset.bilingual = ''; wrapper.className = 'ui-bilingual';
    const primary = document.createElement('span'); primary.lang = 'ja'; primary.textContent = japanese + suffix;
    const subtitle = document.createElement('small'); subtitle.lang = 'en'; subtitle.textContent = original;
    wrapper.append(primary, subtitle); node.replaceWith(wrapper);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[aria-label], img[alt]')) {
    for (const attribute of ['aria-label', 'alt']) {
      const original = element.getAttribute(attribute);
      if (!original || /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(original)) continue;
      const translated = interfaceTranslation(original);
      if (translated) element.setAttribute(attribute, `${translated.japanese} / ${translated.english}`);
    }
  }
}
