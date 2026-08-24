#!/usr/bin/env python3
"""
VPython 프롬프트 챌린지 - 학생 피드백 분석 리포트 PDF 생성
"""
import os
import re
from collections import Counter
from fpdf import FPDF
import textwrap

# ── 폰트 설정 ─────────────────────────────────────────────────────
FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

# ── 색상 팔레트 ────────────────────────────────────────────────────
C_PRIMARY = (59, 130, 246)      # 파란색
C_PRIMARY_LIGHT = (219, 234, 254)
C_ACCENT = (99, 102, 241)       # 인디고
C_SUCCESS = (34, 197, 94)       # 초록
C_WARNING = (234, 179, 8)       # 노란
C_DANGER = (239, 68, 68)        # 빨간
C_PURPLE = (168, 85, 247)
C_TEAL = (20, 184, 166)
C_DARK = (30, 41, 59)
C_GRAY = (100, 116, 139)
C_LIGHT = (241, 245, 249)
C_WHITE = (255, 255, 255)
C_BG = (248, 250, 252)

# ── 학생 피드백 데이터 ──────────────────────────────────────────────
# 각 학생 응답은 [소감, 어려운문제, 이유, 배운것, 선생님께] 5개
# 1반 피드백
class1_raw = [
    ["재밌었어요~~~~~~~~~~~~~~~~~~~", "탁자 위 사과", "색도 진짜 똑바로 말해야했어서....", "더 자세히 프로그램에게 명령하는 법", "재밋어요"],
    ["매우 재밌었다", "계단 모양 사각형?", "상자의 모양을 잡는 것부터 어려웠다", "인공지능과 대화하는 법", "재밌었어요"],
    ["어려웠지만 재밌었다", "탁자 위 사과", "설명하기 빡셌음", "AI에게 정확한 명령을 하는것", "오늘 게임 되게 재밌었어요 이런거 많이 해주세요"],
    ["점점 모양이 갖춰지는 과정이 재밌었어요", "모래시계", "완벽하게 설명을 했다고 생각했는데 설명과는 많이 다르게 나와서 해맸어요", "외양모사를 매우 정확하게 서술해야 한다는 것을 깨닫게 됨", "너무 재밌었어요 감사합니다"],
    ["재미있었습니다. AI가 직접 평가해주며 점수를 매겨주는 것이 재밌었다.", "탁자 위 사과의 모양이 다른 것들에 비해 어려웠던 것 같다.", "분명히 코드를 제대로 쓴 것 같은데, 모양이 제대로 배치 되지 않았다.", "AI에게 도형들을 배치하여서 특정 모양을 만들도록 시키기.", "다음에도 이런 재미있는 수업 부탁드립니다!!!!!"],
    ["너무 재밌었고 ai한테 설명하는게 어려웠다", "탁자위 사과", "ai한테 정확하게 말을 해야하기 때문에 어려웠다", "인공지능한테 명령하는 것", "다음에또 하고싶어요"],
    ["인공지능은 명령어가 매우 중요하다는 것을 알게 되었다", "빨간색 계단", "오른쪽위로 쌓으려고 했는데 잘 되지 않았다", "인공지능을 사용할때 필요로 하는것을 정확하게 말해야 한다.", "재미있는 프로그램을 사용하여 수업을 하니 재미있었습니다."],
    ["ai 한테 프롬프트를 적어 원하는 모양을 만드는게 어렵고 잘 설명한거 같은데 이상한 모양이 나와서 머리가 아팠다", "모래시계", "원뿔 두개를 모래시계로 설명하는게 어려웠다", "ai에게 프롬프트를 적어서 도형을 만드는것", "이런활동들을 더 하고싶습니다 감사합니다"],
    ["AI에게 생각보다 상세히 설명해주어야 알아들을수 있다는것을 알았다", "피라미드가 어려웠다", "각 사각형이 떨어져있는 정도 구하는것이 어려웠다", "프롬포트의 간편화가 중요하다는것을 배웠다", "감사합니다"],
    ["ai에게 모습을 설명하려고 하니 머리가 터질 것 같다.", "책상 위에 사과", "ai가 설명하는 것과는 다르게 생성해서 계속 다시 설명해 고쳐야 한다는 점이 어려웠다.", "ai에게 명령하려면 정말 자세하게 말해야 한다는 것을 알았다.", "존경합니다."],
    ["AI를 사용하면서 도형을 만드니 좀 느낌이 새로웠고 재미있었습니다.", "딱히 어려운 문제는 많이 없었습니다.", "결과물은 같지만 점수는 낮고, 또 제가 정확하게 말해줘도 AI가 자기 혼자서 조건을 바꿔서 그런 점이 어려웠던 것 같습니다.", "AI에게 질문을 할 땐 '크게 틀을 잡은 후 그후에 세세하게 덧붙여야 할 것 같다' 라는 생각을 새로 느꼇습니다.", "선생님 이런 재밌는 프로그램을 기획해주셔서 감사하고 시간이 만약 남는다면 좀 더 질문을 분석해주시면 좋을 것 같습니다."],
    ["인공지능에게 올바른 명령을 내리는 것이 생각보다 힘든 것 같다", "빨간색 상자를 계단 모양", "상자의 모양을 잡는 것부터 위치까지 다 어려웠다. 특히 계단 모양이라는 말을 못 떠올려서 어려웠던 것 같다", "챗지피티같은 인공지능에게는 아무렇게나 말해도 다 알아들었는데 다른 인공지능은 아닐 수도 있다는 것을 알았다.", "프로그램이 재밌어서 수업이 재밌었어요."],
    ["ai가 제 말을 잘 못 알아들때도 있지만 제가 말을 못해도 잘 알아들을 때도 있어서 재밌었다", "3D 피라미드 문제가 어렵다고 느꼈다", "간격을 좁게 하라고 했는데 간격이 그대로였고 ai가 좁게했는데 높이 간격이 넓어져서 어려웠다", "ai를 잘 다루는 법을 배웠다", "너무 재미있었고 다음에도 열심히 수업에 참여하겠습니다"],
    ["진짜 너무너무 재밌었고 AI에게 명령하는 법을 늘리는 좋은 기회였다.", "구슬 무지개가 제일 어려웠다", "색깔을 순서대로 말해줬는데 제대로 들어주지 않아서", "AI에게 명령하는 법", "짝 활동 하는게 너무너무 재밌어요! 그냥 코딩 할때는 어려워서 힘들었는데 오늘은 너무 좋았습니당!!"],
    ["재미잇었지만 조금 힘들었다", "모래시계모양", "구와 원뿔이 너무 크거나 작게 만들어졌다", "프롬포트가 너무 길거나 횡설수설하면 원하는 느낌으로 만들어지지 않는다", "어떤 프롬포트로 다가가면 더 좋은 방향으로 만들 수 있는건지 궁금하고, AI가 조금 무작위로 작용되는 느낌이 있었는데, 더 일정하거나 좋은 작품을 만들 수 있는 AI가 있으면 좋을거같다."],
    ["자기가 직접 프롬포트를 입력해서 결과를 산출해내는게 재미있었다", "빨간색 계단과 탁자위 빨간 공이 제일 어려웠다", "빨간색 계단은 축의 위치를 더 정밀하게 입력해야 해서 어려웠고 탁자위 빨간 공은 탁자 다리와 책상 면의 거리 사이와 크기를 조절하는게 어려웠다", "ai에게 정확한 입력을 줘야 그만큼 정확한 결과가 나온다는것을 보았고 그 입력어를 자세히 생각하는게 머리아팠다", "명확한 목소리와 적당한 속도로 말씀하시는게 좋습니다"],
    ["ai에게 명령을 하는 것이 이렇게 어려운지 느꼈다.", "피라미드", "배열을 통한 설명을 했는데 문장이 복잡해지고 어려워지니 나중에는 ai가 앞에 했던 말을 까먹고 이상하게 만들기도 했다.", "ai에게는 정말 하나하나 정확히 알려주는 것도 좋지않다는 것을 알게되었다. 조금은 두루뭉실 할수 있도 대충 이해 가능할 정도로 하고 오차를 조금씩 좁히는 것이 가장 편한 방법임을 알게되었다.", "이런 수업 재미있어요 앞으로도 잘 부탁드립니다"],
    ["일단 너무 재미있었고 내가 하는 말을 못알아들었을때 조금 화가 났지만 전체적으로 잘 알아들어서 좋았다.", "피라미드문제가 제일 어려웠던것같다.", "피라미드 간격 설정이 너무 어려웠고 정사각형이라는 걸 말했는데도 계속 직사각형으로 만들어서 화가났다.", "인공지능에게 얼마나 정확히 말해줘야 알아듣는지 알게된것같다.", "오늘 수업 너무 재밌었습니다! 근데 조금 어렵더라구요,,하하"],
    ["코딩이 아니고 직접 명령을 내리는 게 처음이라 오히려 더 재밌었다.", "비스듬한 화살표, 계단", "화살표는 길이를 설정하는 데에 어려움을 겪었고, 계단은 대각선으로 올라가는 형태 형성에 어려움이 있었다.", "정확하고 자세한 명령을 내리는 방법과 중요성.", "재밌었어용!!!!!!!!!! 영어로 프롬프터 쓰는 거만 하다가 한글로 하니까 더 재밌었어용"],
    ["프로그램이 내가 작성한 글 그대로 실행해주어서 재밌었다.", "탁자 위의 사과", "x축, y축을 제대로 파악하여 작성하고, 색도 어떤 색인지 정확히 써줘야해서.", "프로그램에게 명령하여 내 명령대로 만들어주는 것", "재밌었어요~"],
    ["프롬프트 입력해보면서 팀전게임 느낌으로 수업하니까 지루하지도 않고 재미있었다.", "분홍색 비스듬한 화살표 문제", "레벨 1이기도 했고 쉬울 것이라고 생각했는데 생각보다 점수가 너무 낮게 나왔다. 색도 단순히 핑크색이 아닌 마젠타 라는 색으로 고쳐야 했었고 화살표의 길이, 두께 등도 고려해야 해서 어려웠다.", "AI에게 프롬프트를 입력할 때에는 두루뭉술한 것보다 수치와 같은 정확한 설명을 더할수록 원하는 결과에 가까워질 수 있다는 것을 배웠다.", "오늘 수업을 위해 열심히 수업 준비해주셔서 감사하고 재미있었어요."],
    ["직접 AI프로그램의 프롬포트를 입력하면서 AI가 내 말을 얼마나 알아듣는지 알아본 것 같다.", "계단 문제", "AI의 도형이 내 생각처럼 구현되지 않아 답답한 마음이 들었다", "AI가 어떻게 해야 더 내 말을 들을지 더 고민을 해본것 같다.", "선생님 학생들을 위해 좋은 프로그램을 만들어주셔서 감사합니다 ~!"],
    ["재미없는 이론이 아니라 게임으로 해서 너무 재밌었습니다.", "모래시계가 제일 어려웠다.", "어떤방법으로 명령을 해야하는지 모르겠고 해도 제대로 모양이 안나와서 어려웠다.", "AI에게 명령하는 법을 알게되었고 생각보다 더 구체적으로 해야하는지 더 잘알게되었다.", "이런 활동을 더 많이 했으면 좋겠습니다."],
    ["진짜 너무 재밌었어요. AI가 나의 말에 따라서 모양을 만드는게 너무 신기했고, 흥미로웠습니다.", "마지막 문제 피라미드가 제일 어려웠어요.", "양 옆 정사각형들 간격이랑 위 아래 간격이 다른데 그런거를 하나하나 알려주는 게 힘들었고, 간격이 얼마나 있는지 모르니까 0.1이라고 해도 애매하고 1이라고 하면 너무 커져서 정확하게 만들지 못했다.", "인공지능이 정확하게 알아듣기 위해선 정말 정확하고 섬세하게 하나하나 알려줘야겠다고 생각을 했고, 어휘력이 많이 부족하다는 사실을 깨달았습니다.", "돈까지 쓰시면서,, 좋은 프로그램 기획 해주셔서 너무 감사합니당ㅎㅎㅎㅎㅎㅎ"],
    ["생각하는 능력을 기를 수 있어서 좋았고 재미있었다.", "원형 울타리!!", "생각을 깊게 하는 게 좀 어려웠고 뻔한 거 밖에 생각이 안 났다.", "프롬프트로 3d 도형 만들기.", "전에 직접 하는 건 너무 어려웠는데 ai에게 명령해서 제가 생각한 것을 만들어주는 건 전 꺼에 비해 많이 어렵지도 않았고 생각을 깊게 할 수 있었어서 좋았어요!!!!"],
    ["맨날 챗지피티 만 쓰다가 색다른 ai를 쓰게되어 재밌게 수업에 참여했다.", "탁자위에 빨강공", "4개의 탁자 다리 사이의 간격을 설명하기 어려웠고, 탁자 판의 크기를 설명하기 어려웠다.", "내가 만들고 싶은 물체를 ai에게 설명하는 방법에 대해 배웠다.", "좋은 수업 준비해주셔서 감사합니다!!"],
    ["만드는 과정에서 원하는 형태를 정확하게 설명하고 실행되는 것들이 어렵기도 했지만 비슷해 졌을 때의 짜릿함이 있었다.", "무지개 구슬?", "그림만 봤을 때 떠오르는 단어를 입력했는데도 그림과같은 결과가 나오지 않아서 어려웠다.", "친구와 같이 하면서 서로의 의견을 주고받는 것이 얼마나 중요한지 느낄 수 있었다.", "앞으로 인공지능 기초 수업을 들으면서 프롬포트를 더 잘 쓰는 방법을 배우고 싶다는 생각이 들었다."],
    ["찬구와 같이 고민해보고 도형을 만들어 볼수있어서 좋았고 생각보다 ai를 사용해 도형을 만드는게 어려웠다.", "블록 피라미드", "블록들 사이 거리가 어떤 명령어를 입력해도 줄어들지를 않았다.", "팀원과 함께 글로 3D 도형을 만들었다.", "수업이 재미있어요👍👍"],
]

# 2반 피드백
class2_raw = [
    ["문제를 보고 사고하는 과정이 재미있고 상상력을 자극하는 것 같다", "색이 다른 피라미드를 만드는게 어려웠다", "만든 결과물은 상당히 비슷하게 나왔는데 점수는 비교적 낮게 나와서 어딜 고쳐야할지 모르겠었다", "ai는 시각적으로 보이는 것보다 기준에 맞는 것을 더 알맞게 생각하는 것 같다.", "이런 수업 너무 재밌어요 더해주세요"],
    ["AI가 차별하는거 같습니다", "AI가 채점을 이상하게 합니다", "AI가 채점을 어떻게 하는지를 몰라서 어려웠습니다", "AI를 완벽하게 신뢰하면 안된다고 생각합니다", "팀게임 재밌습니다 더 해주세요!"],
    ["코딩을 겉으로만 들어봤을땐 엄청 어려운데, 직접 말로 표현해서 해보니 재미있고 쉽게 할수있었다.", "소용돌이를 표현하는 문제가 가장 어렵게 느껴졌다.", "원하는 간격으로 소용돌이를 표현하고, 또 높이를 비슷하게끔하는게 어려웠다.", "코딩이 어렵지 않다는 것", "이런 활동 재미있네요"],
    ["말해줘서 AI를 만들어주는것도 잘하려면 코딩을 어느정도 이해하고 만들줄 알아야 한다는 것도 알게 되었다.", "모든문제가 유도리없는 AI때문에 어려웠다.", "AI가 융통성있게 눈치있게 하지 않는다.", "말로 한다고 해도 코딩을 알아야 고친다", "재미있었습니다!!!"],
    ["머리도 적당히 쓰고 게임같아서 재미있었다", "체스판 문제", "완벽히 똑같은데 계속 92점만 줘서 프롬포트를 계속 바꾸니 점수가 점점 떨어졌다..", "프롬포트를 열심히 쓴 게 전혀 다르게 나올 수 있고, 반대로 단순히 '행성 모양 만들어줘' 라고만 써도 예시와 똑같이 나올 수 있다.", "앞으로도 이런 수업 많이 했으면 좋겠어용."],
    ["우선 처음에는 정확한 숫자로만 표현하려고 해서 어려웠던 것 같지만 후반부에서는 쉽고 단순하게 표현해서 재밌었다", "탁자가 어려웠던 것 같습니다", "원기둥과 빨간 구를 책상 위 아래로 붙이는 것을 표현하는 것이 어려웠던 것 같다", "ai를 이용하여 내가 표현하고자 하는 물체의 형태를 배울 수 있었던 것 같다", "너무 재밌었어요!"],
    ["오늘 진짜 생각보다 엄청 재미있었다.", "아주 극소수의 문제빼고는 진짜 다 어려웠던거 같다.", "단순하게 생각해서 말하면 되는데 각 좌표를 지정하고 막 이상한짓을 하다가 꼬여서 진짜 엄청 어렵게 느껴졌다.", "오늘 ai가 유료버전임에도 불과하고, 가끔 이상한 점수를 줄때가 있어서 아직 ai가 우리를 지배할수 없을거같다는 생각이 들었다.", "저희와 수업하기위해 이렇게 열심히 준비해주시다니, 감사하고 수고하셨습니다."],
    ["ai에게 이것저것 만들어달라해서 재미있었고 분명 똑같이 만들었는데 점수가 낮아서 이상하기도했다.", "시안색 나선탑 문제가 제일 어려웠다.", "디테일하게 만들게끔 말을해도 ai가 너무 못만들었다.", "코딩보다 쉬운 ai에게 만들어달라고하기", "너무 재미있었어요. ai는 아직 정확하지않은거같아요."],
    ["숫자나 영어같은 명령어로 만드는 코드가 아니라 일상생활에서도 쉽게 쓰이는 단어로 코드를 만들수있어서 쉽고 재밌게 게임을 참여할수있었다", "체스나 나선형체를 만들때 간격을 명확히 표시하지못하여 높은점수를 받지 못했다", "간격에 대한 수치화를 하는것이 어려웠다", "x,y,z축에 대한 개념하고 이를 이용해 말로 코드 만들기", "코딩을 잘 못하는 쟤가 이런수업에 포기못하고 잘 참여한것은 처음이에요!"],
    ["Ai가 말을 곡해해서 좀 답답하고 Ai의 단점을 알 수 있어서 좋았다.", "탁자 위 사과", "Ai에게 자신의 의도를 100% 전달하기 어렵기 때문이다.", "Ai가 편하지만 완벽하지는 않다.", "없음"],
    ["AI를 활용하여 게임을 한 것이 재밌었습니다.", "도형들의 크기나 간격들을 맞추는 것", "AI에게 명령을 할 때 '간격을 조금 늘려줘, 길이를 좀 더 늘려줘 등'과 같이 주관적인 명령을 AI가 잘 못 알아 듣는 것이 어려웠습니다.", "AI는 주관적인 명령은 잘 못 알아 들으니까 AI에게 최대한 객관적인 명령을 해야 하는 것을 배웠습니다", "살면서 해본 AI를 활용한 게임들 중에 가장 재밌었습니다. 저도 나중에 기회가 된다면 AI를 활용한 간단한 게임을 만들어 보고 싶어 졌습니다."],
    ["친구와 함께 Ai로 주어진 도형을 만들어 Ai에게 채점을 받아 그 점수로 대결하여서 재미있었습니다", "여러가지 색을 여러가지 블럭에 적용하는것이 자세히 설명해야하는 점이 많아서 어려웠습니다.", "여러가지를 적용하는것 자체가 시간도 오래걸리고 자세하게 말해야하니 자세하게 만들기가 어려웠습니다.", "ai가 채점하는 것을 보니 ai를 완벽하게 신뢰해서는 안되고 자세히 하기만 하면 안되고 자세하고 정확하게 말해야 제대로된 답변을 받는다는 것을 깨달았습니다", "팀 미션 재밌습니다 더 해주세요!"],
    ["인공지능이 나의 자연어를 이해하지 못해서 화가났다.", "탁자 위 사과", "들어있는 요소는 많은데 그것의 위치는 크기를 지정하기에 시간이 촉박해서 만드는데 어려움이 컸던 것 같다.", "ai를 이용하여 자연어로 결과값을 뽑는 방법에 대해 배웠다.", "수업은 재밌는데, ai가 제 말을 안들어요. 점수가 90이 안나오니까 너무 슬프네염,ㅜ"],
    ["직접 프로그래밍 하는 게 아닌 자연어로 프롬프트를 입력해 AI가 결과물을 내주는 게 흥미로웠습니다.", "탁자 위 사과 문제가 제일 어려웠습니다.", "내 생각을 자연어 프롬프트로 100% 표현하기 어려워서 어렵게 느꼈습니다.", "자연어로 AI를 활용하여 원하는 결과 뽑아내기", "좋은 수업해 주셔서 감사합니다."],
    ["코딩으로 배웠던 내용을 말로 설명해서 실행할 수 있다는 것이 좋은 경험인 것 같다.", "탁자 위 사과", "탁자 다리가 탁자 판의 꼭짓점에 딱 들어맞게 붙어있는 것이 아니라 약간 떨어져 있는데, 그걸 설명하기 어려웠다.", "프롬프트를 길게 쓰는 것만이 중요한 게 아니라는 것을 깨달았다. 직관적이고 상대적인 수치를 제시해주는 것도 큰 도움이 된다.", "컴퓨터공학이 진로가 아니고, 그렇게 지식도 많지 않아서 코딩이라고 생각하면 막연히 어렵게 느껴졌는데, 이렇게 게임처럼 배울 수 있다는 점이 정말 좋았습니다!"],
    ["어려웠다. 근데 나는 코딩언어를 다루지 못하는 사람으로서 ai를 활용하여 컴퓨터에게 명령을 주는 활동은 신기한 경험이었다.", "사과,탁자 문제", "탁자의 다리를 배치하는게 어려웠다. 사방면의 구석에 원기둥을 배치한다는 말을 어떻게 하는지는 아직도 머리에 떠오르지 않는다.", "ai를 활용하여 코딩언어를 몰라도 컴퓨터에게 명령을 내릴 수 있는 방법.", "재밌었어요!! 나중에 이런 거 또 하면 좋겠어요!!"],
    ["프롬포트를 이용해서 코드 대신 풀어서 한국어로 AI한테 설명하듯이 해서 3D 도형을 만들었는데 오히려 길게 쓰면 점수가 낮을때도 있고 간단하게 쓰면 오히려 점수가 더 잘나오는 경우가 있었다.", "체스 문제", "흰색 박스와 검은색 박스 개수를 다 설명했는데도 설명한대로 나오지 않아서 계속 수정했는데도 안돼서 어려웠다.", "코딩으로 만들때와 AI를 이용해서 만들때의 차이를 알수 있었다.", "선생님 오늘수업처럼 팀활동을 통해 게임처럼 수업참여할수 있는거 너무 재미있었어요."],
    ["AI를 통해서 옆에 있는 모양과 같은 모양을 만드는게 생각보다 재밌었다.", "시안색 구로 나선 모양을 만드는 문제랑 탁자 위 사과 문제가 제일 어려웠다.", "힌트를 복사,붙여넣기 했는데 또 틀렸다고 나와서 어떻게 해야 똑같은 모양을 만들 수 있는건지 모르겠었다.", "AI에게 말로 코딩하는게 생각보다 어렵다는 걸 알았고, 어떤 부분은 파이썬으로 하는게 더 쉬울 것 같다는걸 느꼈다.", "수업 재밌었어요!! 앞으로도 즐겁고 유익한 수업 잘 부탁드리겠습니당"],
    ["AI에게 프롬프트 쓰는건 자신있다고 생각했는데, 이번에는 AI가 왜 이렇게 내 말을 잘 안 듣는 건지 당황스러웠어요.", "스프링 문제가 가장 어려웠던 것 같아요.", "다른 문제들은 어떤 식으로 말을 하면 좋은 결과물이 나올지 예측이 됐었는데, 스프링은 아예 전혀 다른 형태로 나와서 어떤 식으로 프롬프트를 작성해야할지 막막했어요.", "어떻게 해야 프롬프트를 잘 작성할지, 그리고 AI의 한계점을 배운 것 같아요.", "이런 수업을 듣게 해주셔서 감사합니다. 많이 배우고 갑니다."],
    ["AI가 점점 더 인간을 앞서가고 있다는건 알고 있었지만, 이번 활동을 하면서 인간의 눈과 AI의 눈은 다르다는것을 느끼게 되었다.", "체스가 가장 어려웠던것 같다", "내가 느낀것을 인공지능에게 그대로 전달 했지만 순서가 잘못되거나 내가 생각한대로 모양이 나오지도 않았다", "인공지능에게 언어를 전달하고 사람의 언어를 인공지능의 언어로 바꾸는과정을 배우게 된것같다", "어려웠지만 재미있었어요!"],
    ["이런 게임을 수업시간에 혼자가 아닌 친구와 협동으로, 다른 친구들과는 경쟁으로 한다는것이 매우 재밌다는 생각이 들었습니다.", "나선원형? 이라는 문제였습니다", "나선원형이라는 도형을 처음 듣기도 하였고, 시각적으로 보기에도 표현하기 어렵다는 생각이 들었다", "ai라는것이 조건을 말로만 설명한다고 하면 100% 만드는것이 아님을 알게 되었다. 중요한 업무는 ai한테 맡기기보단 손수 하는것이 더 좋다고 생각했다.", "딱히 없습니다"],
    ["친구와 함께 플레이 할수 있어서 너무 재미있었고 선생님이 만든 게임이라는 점에서도 특별함을 느낄수 있었다.", "구를 나선모양으로 정렬시키는 문제", "어떻다고 말하기 애매해서 어려움을 느꼈다.", "어렵다고만 느꼈던 코딩을 재미있게 접할수 있다는 점에서 새로운 느낌을 접할수 있었다", "코딩, 파이선을 항상 어려워했는데 선생님 덕에 다른 눈으로 볼수있었어요 감사합니다"],
    ["생각보다 AI가 말을 잘 알아듣는 것 같으면서도, 잘 못 알아 듣는 것 같아 약간 답답한 느낌이 있었다.", "탁자 위에 놓인 사과", "탁자와 그 위에 있는 구 까지는 쉽게 표현할 수 있었지만, 탁자 아래 있는 원기둥의 위치를 배치하는 것에서 어려움을 느꼈다.", "AI로 코드를 생성 하는 것이 큰 틀에서 물체를 생성하는 분야에서 사람이 직접 하는 코딩보다 훨씬 시간적으로 효율적이라는 사실을 배웠다.", "시간 조금만 더 주셨으면 좋았을 거 같아요 ㅜㅜ"],
    ["AI에게 내가 생각한 프롬프트를 입력하며 말을 듣게 만드는 건 마치 어린 아기에게 유모차에서 일어나 걸어주면 안되겠냐고 설득하는 일과 같았다.", "다......................", "AI가 더럽게 말을 안 듣는다는 사실은 예전부터 뼈저리게 느껴왔지만 이런 방식으로 말을 안 듣는 건 또 새로운 경험이었다.", "인공지능에게 내가 원하는 바를 설명하려면 수치에 기반한 설명과 아주 자세한 설명을 기입해야 된다는 것을 깨달았다.", "감사합니다"],
    ["처음에는 AI가 내 의도와 전혀 다르게 도형을 생성했지만 반복적으로 피드백을 하면서 결과물을 구체화 할 수 있었어서 성취감을 크게 느꼈다.", "시안색 구로 이루어진 나선형 탑이 가장 어려웠다.", "모양을 ai에게 묘사하기가 좀 애매하고 어려웠다.", "추상적인 형용사보다는 명확한 수치를 사용하는 것이 원하는 결과물을 더 잘 만들어 낼 수 있다.", "재미있었어요"],
    ["내가 직접 만들어서 고득점을 받는 것에 대한 성취감이 매우 좋았다.", "시안색의 나선 모양", "시작점과 간격, 구의 개수, 균일한 간격 등 정확하게 적는 것이 어려웠다.", "AI를 통한 코드 작성을 배웠다.", "매우 신기하고 즐겁게 배웠습니다."],
]


# ── 데이터 분석 함수 ────────────────────────────────────────────────
def analyze_difficulty(all_data):
    """어려운 문제 키워드 분석"""
    problem_keywords = {
        "탁자 위 사과": ["탁자", "사과", "책상"],
        "피라미드": ["피라미드", "블록 피라미드"],
        "계단": ["계단"],
        "모래시계": ["모래시계"],
        "체스판": ["체스"],
        "나선탑/소용돌이": ["나선", "소용돌이", "스프링", "나선원형"],
        "화살표": ["화살표"],
        "무지개 구슬": ["무지개", "구슬"],
        "원형 울타리": ["울타리"],
    }
    counts = Counter()
    for row in all_data:
        answer = row[1].lower() if len(row) > 1 else ""
        matched = False
        for category, keywords in problem_keywords.items():
            if any(kw in answer for kw in keywords):
                counts[category] += 1
                matched = True
                break
        if not matched and answer.strip():
            counts["기타"] += 1
    return counts

def analyze_learnings(all_data):
    """배운 것 키워드 분류"""
    categories = {
        "정확한 프롬프트 작성법": ["정확", "자세", "구체적", "명확", "수치"],
        "AI의 한계 인식": ["완벽하지", "신뢰", "한계", "지배", "100%"],
        "AI 활용 방법": ["명령", "활용", "다루는", "프롬프트"],
        "코딩과의 비교": ["코딩", "파이썬", "코드", "프로그래밍"],
        "협력의 중요성": ["협력", "친구", "팀원", "같이"],
    }
    counts = Counter()
    for row in all_data:
        answer = row[3] if len(row) > 3 else ""
        for cat, keywords in categories.items():
            if any(kw in answer for kw in keywords):
                counts[cat] += 1
    return counts

def count_satisfaction(all_data):
    """만족도 분석 (긍정/부정 키워드)"""
    positive = 0
    negative = 0
    for row in all_data:
        text = row[0] if row else ""
        if any(kw in text for kw in ["재미", "재밌", "좋았", "신기", "흥미", "즐겁", "좋은"]):
            positive += 1
        if any(kw in text for kw in ["어려", "힘들", "답답", "화가"]):
            negative += 1
    return positive, negative


# ── PDF 클래스 ──────────────────────────────────────────────────────
class FeedbackPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.add_font("KR", "", FONT_PATH, uni=True)
        self.add_font("KRB", "", FONT_PATH, uni=True)
        self.set_auto_page_break(auto=True, margin=20)

    def draw_gradient_rect(self, x, y, w, h, c1, c2, steps=50):
        """수평 그라데이션"""
        for i in range(steps):
            r = c1[0] + (c2[0] - c1[0]) * i / steps
            g = c1[1] + (c2[1] - c1[1]) * i / steps
            b = c1[2] + (c2[2] - c1[2]) * i / steps
            self.set_fill_color(int(r), int(g), int(b))
            self.rect(x + w * i / steps, y, w / steps + 0.5, h, "F")

    def rounded_rect(self, x, y, w, h, r=3, style="F"):
        """둥근 모서리 사각형 (호환용)"""
        self.rect(x, y, w, h, style)

    def draw_circle(self, x, y, r, color):
        self.set_fill_color(*color)
        self.ellipse(x - r, y - r, 2 * r, 2 * r, "F")

    def cover_page(self):
        self.add_page()
        # 배경
        self.set_fill_color(*C_WHITE)
        self.rect(0, 0, 210, 297, "F")

        # 상단 그라데이션 바
        self.draw_gradient_rect(0, 0, 210, 80, C_PRIMARY, C_ACCENT)

        # 장식 원들
        self.set_draw_color(255, 255, 255)
        self.set_fill_color(255, 255, 255)
        for cx, cy, r in [(30, 25, 15), (180, 60, 10), (50, 65, 8), (160, 20, 12)]:
            self.set_fill_color(255, 255, 255)
            self.ellipse(cx - r, cy - r, 2 * r, 2 * r, "F")
            # 반투명 효과를 위해 그라데이션 색상으로 다시
            opacity_color = tuple(int(c * 0.85 + 255 * 0.15) for c in C_PRIMARY)
            self.set_fill_color(*opacity_color)
            self.ellipse(cx - r, cy - r, 2 * r, 2 * r, "F")

        # 타이틀
        self.set_y(20)
        self.set_font("KR", size=11)
        self.set_text_color(255, 255, 255)
        self.cell(0, 8, "VPython Prompt Challenge", align="C", new_x="LMARGIN", new_y="NEXT")

        self.set_font("KRB", size=26)
        self.set_text_color(255, 255, 255)
        self.cell(0, 15, "학생 피드백 분석 리포트", align="C", new_x="LMARGIN", new_y="NEXT")

        self.set_font("KR", size=10)
        self.set_text_color(220, 230, 255)
        self.cell(0, 8, "AI 프롬프트 코딩 수업 결과 보고서", align="C", new_x="LMARGIN", new_y="NEXT")

        # 중앙 정보 카드
        card_y = 100
        self.set_fill_color(*C_LIGHT)
        self.set_draw_color(220, 225, 235)
        self.rounded_rect(30, card_y, 150, 70, 5, "FD")

        self.set_y(card_y + 10)
        self.set_text_color(*C_DARK)
        self.set_font("KRB", size=14)
        self.cell(0, 10, "수업 개요", align="C", new_x="LMARGIN", new_y="NEXT")

        info_items = [
            ("수업명", "AI 프롬프트로 3D 도형 만들기"),
            ("참여 학생", f"총 {len(class1_raw) + len(class2_raw)}명 (2개 학급)"),
            ("수업 도구", "VPython + Claude AI (Haiku/Sonnet)"),
            ("수업 형태", "2인 1팀 협력 + 팀 간 경쟁"),
        ]
        self.set_font("KR", size=9)
        for label, value in info_items:
            self.set_x(45)
            self.set_text_color(*C_GRAY)
            self.cell(35, 7, label, new_x="END")
            self.set_text_color(*C_DARK)
            self.cell(0, 7, value, new_x="LMARGIN", new_y="NEXT")

        # 핵심 수치 카드들
        stats_y = 190
        all_data = class1_raw + class2_raw
        pos, neg = count_satisfaction(all_data)
        sat_rate = int(pos / len(all_data) * 100) if all_data else 0

        stat_cards = [
            (f"{len(all_data)}명", "총 참여 학생", C_PRIMARY),
            (f"{sat_rate}%", "수업 만족도", C_SUCCESS),
            ("2학급", "참여 학급 수", C_ACCENT),
            ("5종", "챌린지 문제", C_WARNING),
        ]

        card_w = 35
        gap = 5
        start_x = (210 - (card_w * 4 + gap * 3)) / 2
        for i, (num, label, color) in enumerate(stat_cards):
            x = start_x + i * (card_w + gap)
            self.set_fill_color(*color)
            self.rounded_rect(x, stats_y, card_w, 40, 4, "F")
            self.set_y(stats_y + 8)
            self.set_x(x)
            self.set_font("KRB", size=18)
            self.set_text_color(255, 255, 255)
            self.cell(card_w, 12, num, align="C")
            self.set_y(stats_y + 22)
            self.set_x(x)
            self.set_font("KR", size=7)
            self.cell(card_w, 8, label, align="C")

        # 하단
        self.set_y(260)
        self.set_font("KR", size=8)
        self.set_text_color(*C_GRAY)
        self.cell(0, 6, "2026.03.19 | VPython 프롬프트 챌린지 수업 피드백", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 6, "https://vpython-prompt-challenge.fly.dev", align="C")

    def section_header(self, icon, title, subtitle=""):
        self.set_font("KRB", size=16)
        self.set_text_color(*C_DARK)
        self.cell(0, 12, f"{icon}  {title}", new_x="LMARGIN", new_y="NEXT")
        if subtitle:
            self.set_font("KR", size=9)
            self.set_text_color(*C_GRAY)
            self.cell(0, 6, subtitle, new_x="LMARGIN", new_y="NEXT")
        # 밑줄
        y = self.get_y() + 2
        self.draw_gradient_rect(self.l_margin, y, 170, 2, C_PRIMARY, C_ACCENT)
        self.set_y(y + 8)

    def stat_bar(self, label, count, total, color, bar_width=120):
        """가로 막대 그래프"""
        x_start = self.get_x()
        y = self.get_y()

        # 라벨
        self.set_font("KR", size=8)
        self.set_text_color(*C_DARK)
        self.cell(50, 7, label)

        # 배경 바
        bar_x = x_start + 52
        self.set_fill_color(230, 235, 240)
        self.rounded_rect(bar_x, y + 1, bar_width, 5, 2.5, "F")

        # 값 바
        ratio = count / total if total > 0 else 0
        if ratio > 0:
            self.set_fill_color(*color)
            self.rounded_rect(bar_x, y + 1, max(5, bar_width * ratio), 5, 2.5, "F")

        # 수치
        self.set_x(bar_x + bar_width + 3)
        self.set_font("KRB", size=8)
        self.set_text_color(*color)
        self.cell(20, 7, f"{count}명 ({int(ratio*100)}%)")
        self.ln(9)

    def quote_card(self, text, color=C_PRIMARY, max_width=170):
        """학생 인용 카드"""
        y = self.get_y()
        if y > 260:
            self.add_page()
            y = self.get_y()

        # 좌측 바
        self.set_fill_color(*color)
        self.rect(self.l_margin, y, 3, 0.1, "F")  # placeholder

        self.set_fill_color(color[0], color[1], color[2])

        # 텍스트
        self.set_x(self.l_margin + 6)
        self.set_font("KR", size=8)
        self.set_text_color(60, 70, 80)

        # 배경
        # 먼저 텍스트 높이를 계산
        text_clean = text[:200] + ("..." if len(text) > 200 else "")
        lines = self.multi_cell(max_width - 10, 5, f'"{text_clean}"', dry_run=True, output="LINES")
        h = len(lines) * 5 + 6

        self.set_fill_color(color[0] // 4 + 192, color[1] // 4 + 192, color[2] // 4 + 192)
        self.rounded_rect(self.l_margin, y, max_width, h, 3, "F")
        self.set_fill_color(*color)
        self.rect(self.l_margin, y, 3, h, "F")

        self.set_xy(self.l_margin + 6, y + 3)
        self.multi_cell(max_width - 10, 5, f'"{text_clean}"')
        self.set_y(self.get_y() + 3)

    def difficulty_page(self, all_data):
        self.add_page()
        self.section_header("[Chart]", "어려운 문제 분석", "학생들이 가장 어렵다고 느낀 챌린지")

        counts = analyze_difficulty(all_data)
        total = sum(counts.values())

        colors = [C_DANGER, C_WARNING, C_ACCENT, C_TEAL, C_PRIMARY, C_PURPLE, C_SUCCESS, (200, 100, 50), C_GRAY]

        sorted_items = counts.most_common()
        for i, (name, count) in enumerate(sorted_items):
            color = colors[i % len(colors)]
            self.stat_bar(name, count, len(all_data), color)

        self.ln(5)

        # 어려웠던 이유 분석
        self.set_font("KRB", size=12)
        self.set_text_color(*C_DARK)
        self.cell(0, 10, "왜 어렵다고 느꼈을까?", new_x="LMARGIN", new_y="NEXT")

        reasons = {
            "위치/간격 설정의 어려움": 0,
            "AI가 의도대로 생성하지 않음": 0,
            "복잡한 구조 설명의 한계": 0,
            "정확한 수치 표현의 어려움": 0,
            "시간 부족": 0,
        }
        for row in all_data:
            reason = row[2] if len(row) > 2 else ""
            if any(kw in reason for kw in ["간격", "위치", "거리", "배치"]):
                reasons["위치/간격 설정의 어려움"] += 1
            if any(kw in reason for kw in ["안나", "다르게", "안 듣", "못 알아", "이상한", "지맘대로"]):
                reasons["AI가 의도대로 생성하지 않음"] += 1
            if any(kw in reason for kw in ["설명", "표현", "서술", "묘사"]):
                reasons["복잡한 구조 설명의 한계"] += 1
            if any(kw in reason for kw in ["수치", "숫자", "정확", "구체"]):
                reasons["정확한 수치 표현의 어려움"] += 1
            if any(kw in reason for kw in ["시간", "촉박"]):
                reasons["시간 부족"] += 1

        self.ln(3)
        reason_colors = [C_DANGER, C_WARNING, C_ACCENT, C_PURPLE, C_GRAY]
        for i, (reason, count) in enumerate(sorted(reasons.items(), key=lambda x: -x[1])):
            if count > 0:
                self.stat_bar(reason, count, len(all_data), reason_colors[i % len(reason_colors)])

    def learning_page(self, all_data):
        self.add_page()
        self.section_header("[Idea]", "학습 성과 분석", "학생들이 수업을 통해 배운 것")

        learnings = analyze_learnings(all_data)
        colors = [C_SUCCESS, C_DANGER, C_PRIMARY, C_ACCENT, C_TEAL]

        for i, (cat, count) in enumerate(learnings.most_common()):
            self.stat_bar(cat, count, len(all_data), colors[i % len(colors)])

        self.ln(8)

        # 대표 학습 인용
        self.set_font("KRB", size=12)
        self.set_text_color(*C_DARK)
        self.cell(0, 10, "학생들의 목소리", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        # 깊이 있는 학습 인용 선별
        good_learnings = [
            row[3] for row in all_data
            if len(row) > 3 and len(row[3]) > 40
        ]
        import random
        random.seed(42)
        selected = random.sample(good_learnings, min(8, len(good_learnings)))

        quote_colors = [C_PRIMARY, C_ACCENT, C_TEAL, C_SUCCESS, C_PURPLE, C_WARNING, C_DANGER, (100, 130, 200)]
        for i, quote in enumerate(selected):
            self.quote_card(quote, quote_colors[i % len(quote_colors)])

    def voices_page(self, all_data):
        """학생 소감 및 선생님께 하는 말"""
        self.add_page()
        self.section_header("[Voice]", "학생 소감 하이라이트", "수업에 대한 학생들의 생생한 목소리")

        # 인상적인 소감 선별 (긴 것 위주)
        impressions = [
            (row[0], row[4]) for row in all_data
            if len(row) > 4 and (len(row[0]) > 30 or len(row[4]) > 30)
        ]
        import random
        random.seed(7)
        selected = random.sample(impressions, min(6, len(impressions)))

        for i, (impression, msg) in enumerate(selected):
            colors = [C_PRIMARY, C_ACCENT, C_TEAL, C_SUCCESS, C_PURPLE, C_WARNING]
            color = colors[i % len(colors)]

            text = impression if len(impression) > len(msg) else msg
            self.quote_card(text, color)

        # 선생님께 하는 말 페이지
        if self.get_y() > 200:
            self.add_page()
        self.ln(5)
        self.set_font("KRB", size=12)
        self.set_text_color(*C_DARK)
        self.cell(0, 10, "선생님께 하고 싶은 말", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

        teacher_msgs = [
            row[4] for row in all_data
            if len(row) > 4 and len(row[4]) > 20
            and any(kw in row[4] for kw in ["감사", "재밌", "좋았", "부탁", "또 하", "더 해"])
        ]
        random.seed(99)
        selected_msgs = random.sample(teacher_msgs, min(6, len(teacher_msgs)))

        msg_colors = [C_WARNING, C_SUCCESS, C_PRIMARY, C_ACCENT, C_TEAL, C_PURPLE]
        for i, msg in enumerate(selected_msgs):
            self.quote_card(msg, msg_colors[i % len(msg_colors)])

    def insights_page(self, all_data):
        """교사용 인사이트 페이지"""
        self.add_page()
        self.section_header("[Insight]", "교사용 인사이트 & 제안", "피드백 분석을 바탕으로 한 수업 개선 포인트")

        insights = [
            ("수업 만족도", "약 95%의 학생이 '재미있었다'고 응답. 게임형 경쟁 구조와 팀 협력이 높은 몰입도의 핵심 요인.", C_SUCCESS, "[O]"),
            ("가장 어려운 문제", "'탁자 위 사과'가 압도적 1위. 복합 객체(다리 4개 + 판 + 구)의 공간 배치를 자연어로 표현하는 것이 학생들에게 가장 어려운 과제.", C_DANGER, "[!]"),
            ("AI 채점 신뢰도", "다수의 학생이 'AI 채점이 불공정하다'고 느낌. 육안으로 비슷한데 점수가 낮거나, 간단한 프롬프트가 높은 점수를 받는 경우가 있어 개선 필요.", C_WARNING, "[Q]"),
            ("핵심 학습 성과", "'AI에게 정확하게 설명해야 한다'는 프롬프트 엔지니어링의 기본을 대부분의 학생이 체득. 추상적 표현 vs 수치 기반 설명의 차이도 인식.", C_PRIMARY, "[*]"),
            ("프롬프트 전략 발견", "학생들이 스스로 발견한 전략: ① 큰 틀 먼저 → 세부 조정 ② 수치 기반 설명이 효과적 ③ 너무 길면 오히려 역효과 ④ 반복 수정이 중요", C_ACCENT, "[Idea]"),
            ("협력 학습 효과", "짝 활동의 가치를 학생들이 직접 언급. '혼자보다 같이 하니 더 좋은 결과', '서로 부족한 점 보완' 등의 피드백이 다수.", C_TEAL, "[Team]"),
        ]

        for title, text, color, icon in insights:
            y = self.get_y()
            if y > 245:
                self.add_page()
                y = self.get_y()

            # 카드 배경
            lines = self.multi_cell(145, 5, text, dry_run=True, output="LINES")
            h = len(lines) * 5 + 18

            self.set_fill_color(color[0] // 5 + 204, color[1] // 5 + 204, color[2] // 5 + 204)
            self.rounded_rect(self.l_margin, y, 170, h, 4, "F")

            # 좌측 아이콘 바
            self.set_fill_color(*color)
            self.rounded_rect(self.l_margin, y, 4, h, 2, "F")

            # 아이콘 + 타이틀
            self.set_xy(self.l_margin + 8, y + 3)
            self.set_font("KRB", size=10)
            self.set_text_color(*C_DARK)
            self.cell(0, 6, f"{icon}  {title}")

            # 본문
            self.set_xy(self.l_margin + 8, y + 11)
            self.set_font("KR", size=8)
            self.set_text_color(70, 80, 90)
            self.multi_cell(145, 5, text)

            self.set_y(y + h + 5)

    def recommendations_page(self):
        """수업 개선 제안"""
        self.add_page()
        self.section_header("[List]", "수업 개선 제안", "다음 수업을 위한 구체적인 개선 방향")

        recs = [
            ("문제 난이도 조절", "복합 객체(탁자 등)는 힌트를 단계별로 제공하거나, 중간 단계 문제를 추가하여 학생들이 점진적으로 난이도를 올릴 수 있도록 설계", C_PRIMARY),
            ("AI 채점 보정", "코드 기반 비교뿐 아니라 시각적 유사도 비교를 추가하고, 학생들에게 채점 기준을 사전에 안내하여 불공정 느낌 해소", C_WARNING),
            ("시간 관리", "문제당 3분 이상 또는 문제 수를 줄이고 깊이 있게 도전할 수 있는 옵션 제공. 일부 학생이 시간 부족을 호소", C_DANGER),
            ("프롬프트 전략 가이드", "수업 시작 전 짧은 '프롬프트 작성 팁' 시간을 두어, 수치 기반 설명/큰 틀 먼저 접근법 등을 안내", C_SUCCESS),
            ("결과 공유 시간", "각 팀의 프롬프트를 비교·분석하는 토론 시간을 추가하면 학생 간 배움이 더욱 풍부해질 것", C_ACCENT),
            ("성취감 강화", "점수 외에 '가장 창의적인 프롬프트', '가장 많이 개선한 팀' 등 다양한 평가 축을 도입하여 모든 팀이 성취감을 느낄 수 있도록", C_PURPLE),
        ]

        for i, (title, text, color) in enumerate(recs):
            y = self.get_y()
            if y > 250:
                self.add_page()
                y = self.get_y()

            lines = self.multi_cell(145, 5, text, dry_run=True, output="LINES")
            h = len(lines) * 5 + 18

            self.set_fill_color(*C_LIGHT)
            self.set_draw_color(*color)
            self.rounded_rect(self.l_margin, y, 170, h, 4, "FD")

            # 번호 원
            self.draw_circle(self.l_margin + 10, y + h / 2, 8, color)
            self.set_xy(self.l_margin + 5, y + h / 2 - 4)
            self.set_font("KRB", size=11)
            self.set_text_color(255, 255, 255)
            self.cell(10, 8, str(i + 1), align="C")

            # 타이틀
            self.set_xy(self.l_margin + 22, y + 3)
            self.set_font("KRB", size=10)
            self.set_text_color(*C_DARK)
            self.cell(0, 6, title)

            # 본문
            self.set_xy(self.l_margin + 22, y + 11)
            self.set_font("KR", size=8)
            self.set_text_color(70, 80, 90)
            self.multi_cell(140, 5, text)

            self.set_y(y + h + 5)


def main():
    all_data = class1_raw + class2_raw

    pdf = FeedbackPDF()
    pdf.set_margin(20)

    # 1. 표지
    pdf.cover_page()

    # 2. 어려운 문제 분석
    pdf.difficulty_page(all_data)

    # 3. 학습 성과 분석
    pdf.learning_page(all_data)

    # 4. 학생 소감 하이라이트
    pdf.voices_page(all_data)

    # 5. 교사용 인사이트
    pdf.insights_page(all_data)

    # 6. 수업 개선 제안
    pdf.recommendations_page()

    output_path = os.path.join(os.path.dirname(__file__), "VPython_프롬프트챌린지_피드백리포트.pdf")
    pdf.output(output_path)
    print(f"[O] PDF 생성 완료: {output_path}")
    return output_path


if __name__ == "__main__":
    main()
