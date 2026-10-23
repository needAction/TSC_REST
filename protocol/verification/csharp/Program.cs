using EscapeGame.Protocol.V1;
using Google.Protobuf;

if (args.Length != 2)
    throw new ArgumentException("사용법: ProtocolVerification <입력폴더> <출력폴더>");

Directory.CreateDirectory(args[1]);
foreach (var name in new[] { "success", "failure", "empty", "unknown", "default-failure", "last-oneof" })
{
    var message = QuerySessionResponse.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(args[0], name + ".bin")));
    switch (name)
    {
        case "success":
            if (message.OutcomeCase != QuerySessionResponse.OutcomeOneofCase.Snapshot ||
                message.Snapshot.SessionId != "session-001" || message.Snapshot.Phase != SessionPhase.Loading ||
                message.Snapshot.Players.Count != 2 || message.Snapshot.Players[0].PlayerId != "player-a" ||
                message.Snapshot.Players[0].Role != PlayerRole.RoleA || !message.Snapshot.Players[0].SceneLoaded ||
                message.Snapshot.Players[1].PlayerId != "player-b" || message.Snapshot.Players[1].Role != PlayerRole.RoleB ||
                message.Snapshot.Players[1].SceneLoaded)
                throw new Exception("TS → C# 성공 메시지 불일치");
            break;
        case "failure":
            if (message.OutcomeCase != QuerySessionResponse.OutcomeOneofCase.Failure ||
                message.Failure.Code != SessionErrorCode.InvalidParticipant)
                throw new Exception("TS → C# 실패 메시지 불일치");
            break;
        case "empty":
            if (message.OutcomeCase != QuerySessionResponse.OutcomeOneofCase.None)
                throw new Exception("미지정 oneof 불일치");
            break;
        case "unknown":
            if ((int)message.Failure.Code != 999)
                throw new Exception("알 수 없는 enum 보존 실패");
            break;
        case "default-failure":
            if (message.OutcomeCase != QuerySessionResponse.OutcomeOneofCase.Failure || (int)message.Failure.Code != 0)
                throw new Exception("0 기본값과 oneof 분기 구분 실패");
            break;
        case "last-oneof":
            if (message.OutcomeCase != QuerySessionResponse.OutcomeOneofCase.Failure || message.Failure.Code != SessionErrorCode.InvalidParticipant)
                throw new Exception("oneof 최종 분기 처리 불일치");
            break;
    }
    File.WriteAllBytes(Path.Combine(args[1], name + ".bin"), message.ToByteArray());
}

bool rejectedMalformed = false;
try
{
    QuerySessionResponse.Parser.ParseFrom(new byte[] { 10, 5, 1 });
}
catch (InvalidProtocolBufferException)
{
    rejectedMalformed = true;
}
if (!rejectedMalformed) throw new Exception("잘린 바이너리를 허용했습니다.");

// C#에서 독립적으로 생성한 성공/실패도 TS에서 확인합니다.
var success = new QuerySessionResponse
{
    Snapshot = new SessionSnapshot { SessionId = "csharp-session", Phase = SessionPhase.Waiting }
};
success.Snapshot.Players.Add(new PlayerSnapshot { PlayerId = "csharp-a", Role = PlayerRole.RoleA, SceneLoaded = true });
File.WriteAllBytes(Path.Combine(args[1], "csharp-success.bin"), success.ToByteArray());
var failure = new QuerySessionResponse { Failure = new SessionFailure { Code = SessionErrorCode.SessionNotFound } };
File.WriteAllBytes(Path.Combine(args[1], "csharp-failure.bin"), failure.ToByteArray());
Console.WriteLine("C# 디코딩·인코딩 검증 통과");
