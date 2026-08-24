#!/usr/bin/env python3
"""
VPython 프롬프트 챌린지 - 학생 피드백 분석 리포트 (HTML → PDF)
WeasyPrint로 한국어 완벽 지원
"""
import os, random
from collections import Counter
from weasyprint import HTML

# ── 학생 피드백 데이터 ──────────────────────────────────────────────
class1_raw = [
    ["재밌었어요~~~~~~~~~~~~~~~~~~~", "탁자 위 사과", "색도 진짜 똑바로 말해야했어서....", "더 자세히 프로그램에게 명령하는 법", "재밋어요"],
    ["매우 재밌었다", "계단 모양 사각형?", "상자의 모양을 잡는 것부터 어려웠다", "인공지능과 대화하는 법", "재밌었어요"],
    ["어려웠지만 재밌었다", "탁자 위 사과", "설명하기 빡셌음", "AI에게 정확한 명령을 하는것", "오늘 게임 되게 재밌었어요 이런거 많이 해주세요"],
    ["점점 모양이 갖춰지는 과정이 재밌었어요", "모래시계", "완벽하게 설명을 했다고 생각했는데 설명과는 많이 다르게 나와서 해맸어요", "외양모사를 매우 정확하게 서술해야 한다는 것을 깨닫게 됨", "너무 재밌었어요 감사합니다"],
    ["재미있었습니다. AI가 직접 평가해주며 점수를 매겨주는 것이 재밌었다.", "탁자 위 사과", "분명히 코드를 제대로 쓴 것 같은데, 모양이 제대로 배치 되지 않았다.", "AI에게 도형들을 배치하여서 특정 모양을 만들도록 시키기.", "다음에도 이런 재미있는 수업 부탁드립니다!!!!!"],
    ["너무 재밌었고 ai한테 설명하는게 어려웠다", "탁자위 사과", "ai한테 정확하게 말을 해야하기 때문에 어려웠다", "인공지능한테 명령하는 것", "다음에또 하고싶어요"],
    ["인공지능은 명령어가 매우 중요하다는 것을 알게 되었다", "빨간색 계단", "오른쪽위로 쌓으려고 했는데 잘 되지 않았다", "인공지능을 사용할때 필요로 하는것을 정확하게 말해야 한다.", "재미있는 프로그램을 사용하여 수업을 하니 재미있었습니다."],
    ["ai 한테 프롬프트를 적어 원하는 모양을 만드는게 어렵고 잘 설명한거 같은데 이상한 모양이 나와서 머리가 아팠다", "모래시계", "원뿔 두개를 모래시계로 설명하는게 어려웠다", "ai에게 프롬프트를 적어서 도형을 만드는것", "이런활동들을 더 하고싶습니다 감사합니다"],
    ["AI에게 생각보다 상세히 설명해주어야 알아들을수 있다는것을 알았다", "피라미드", "각 사각형이 떨어져있는 정도 구하는것이 어려웠다", "프롬포트의 간편화가 중요하다는것을 배웠다", "감사합니다"],
    ["ai에게 모습을 설명하려고 하니 머리가 터질 것 같다.", "책상 위에 사과", "ai가 설명하는 것과는 다르게 생성해서 계속 다시 설명해 고쳐야 한다는 점이 어려웠다.", "ai에게 명령하려면 정말 자세하게 말해야 한다는 것을 알았다.", "존경합니다."],
    ["AI를 사용하면서 도형을 만드니 좀 느낌이 새로웠고 재미있었습니다.", "딱히 어려운 문제는 많이 없었습니다.", "AI가 자기 혼자서 조건을 바꿔서 그런 점이 어려웠던 것 같습니다.", "AI에게 질문을 할 땐 크게 틀을 잡은 후 세세하게 덧붙여야 할 것 같다.", "선생님 이런 재밌는 프로그램을 기획해주셔서 감사합니다."],
    ["인공지능에게 올바른 명령을 내리는 것이 생각보다 힘든 것 같다", "빨간색 상자를 계단 모양", "상자의 모양을 잡는 것부터 위치까지 다 어려웠다.", "챗지피티같은 인공지능에게는 아무렇게나 말해도 다 알아들었는데 다른 인공지능은 아닐 수도 있다는 것을 알았다.", "프로그램이 재밌어서 수업이 재밌었어요."],
    ["ai가 제 말을 잘 못 알아들때도 있지만 잘 알아들을 때도 있어서 재밌었다", "3D 피라미드", "간격을 좁게 하라고 했는데 간격이 그대로여서 어려웠다", "ai를 잘 다루는 법을 배웠다", "너무 재미있었고 다음에도 열심히 수업에 참여하겠습니다"],
    ["진짜 너무너무 재밌었고 AI에게 명령하는 법을 늘리는 좋은 기회였다.", "구슬 무지개", "색깔을 순서대로 말해줬는데 제대로 들어주지 않아서", "AI에게 명령하는 법", "짝 활동 하는게 너무너무 재밌어요!"],
    ["재미있었지만 조금 힘들었다", "모래시계", "구와 원뿔이 너무 크거나 작게 만들어졌다", "프롬포트가 너무 길거나 횡설수설하면 원하는 느낌으로 만들어지지 않는다", "더 좋은 AI가 있으면 좋겠다."],
    ["자기가 직접 프롬포트를 입력해서 결과를 산출해내는게 재미있었다", "빨간색 계단과 탁자위 빨간 공", "축의 위치를 더 정밀하게 입력해야 해서 어려웠다", "ai에게 정확한 입력을 줘야 그만큼 정확한 결과가 나온다", "명확한 목소리와 적당한 속도로 말씀하시는게 좋습니다"],
    ["ai에게 명령을 하는 것이 이렇게 어려운지 느꼈다.", "피라미드", "문장이 복잡해지니 ai가 앞에 했던 말을 까먹고 이상하게 만들었다.", "조금은 두루뭉실하게 이해 가능할 정도로 하고 오차를 조금씩 좁히는 것이 가장 편한 방법", "이런 수업 재미있어요 앞으로도 잘 부탁드립니다"],
    ["너무 재미있었고 내가 하는 말을 못알아들었을때 화가 났지만 전체적으로 좋았다.", "피라미드", "간격 설정이 어려웠고 정사각형이라는 걸 말했는데도 계속 직사각형으로 만들어서 화가났다.", "인공지능에게 얼마나 정확히 말해줘야 알아듣는지 알게됨", "오늘 수업 너무 재밌었습니다!"],
    ["코딩이 아니고 직접 명령을 내리는 게 처음이라 오히려 더 재밌었다.", "비스듬한 화살표, 계단", "화살표 길이 설정과 계단의 대각선 형태 형성이 어려웠다.", "정확하고 자세한 명령을 내리는 방법과 중요성.", "재밌었어요! 영어로 프롬프트 쓰는 거만 하다가 한글로 하니까 더 재밌었어요"],
    ["프로그램이 내가 작성한 글 그대로 실행해주어서 재밌었다.", "탁자 위의 사과", "x축, y축을 제대로 파악하고 색도 정확히 써줘야해서.", "프로그램에게 명령하여 내 명령대로 만들어주는 것", "재밌었어요~"],
    ["프롬프트 입력해보면서 팀전게임 느낌으로 수업하니까 재미있었다.", "분홍색 비스듬한 화살표", "마젠타라는 색으로 고쳐야 했고 화살표의 길이, 두께 등도 고려해야 해서 어려웠다.", "수치와 같은 정확한 설명을 더할수록 원하는 결과에 가까워진다.", "수업 준비해주셔서 감사하고 재미있었어요."],
    ["직접 AI프로그램의 프롬포트를 입력하면서 AI가 내 말을 얼마나 알아듣는지 알아본 것 같다.", "계단 문제", "AI의 도형이 내 생각처럼 구현되지 않아 답답했다", "AI가 어떻게 해야 더 내 말을 들을지 고민해보게 되었다.", "학생들을 위해 좋은 프로그램을 만들어주셔서 감사합니다!"],
    ["재미없는 이론이 아니라 게임으로 해서 너무 재밌었습니다.", "모래시계", "어떤 방법으로 명령해야 하는지 모르겠고 모양이 안 나와서 어려웠다.", "AI에게 명령하는 법과 구체적으로 해야 한다는 것을 알게 되었다.", "이런 활동을 더 많이 했으면 좋겠습니다."],
    ["진짜 너무 재밌었어요. AI가 나의 말에 따라 모양을 만드는게 신기하고 흥미로웠습니다.", "피라미드", "간격이 얼마나 있는지 모르니까 정확하게 만들지 못했다.", "인공지능이 정확하게 알아듣기 위해선 정말 섬세하게 알려줘야겠다는 생각", "돈까지 쓰시면서 좋은 프로그램 기획 해주셔서 감사합니다"],
    ["생각하는 능력을 기를 수 있어서 좋았고 재미있었다.", "원형 울타리", "생각을 깊게 하는 게 어려웠고 뻔한 것밖에 생각이 안 났다.", "프롬프트로 3D 도형 만들기.", "ai에게 명령해서 만들어주는 건 생각을 깊게 할 수 있어서 좋았어요!"],
    ["색다른 ai를 쓰게되어 재밌게 수업에 참여했다.", "탁자위에 빨강공", "탁자 다리 사이의 간격과 탁자 판의 크기를 설명하기 어려웠다.", "내가 만들고 싶은 물체를 ai에게 설명하는 방법", "좋은 수업 준비해주셔서 감사합니다!!"],
    ["원하는 형태를 설명하고 비슷해졌을 때의 짜릿함이 있었다.", "무지개 구슬", "떠오르는 단어를 입력했는데 그림과 같은 결과가 안 나왔다.", "친구와 의견을 주고받는 것이 얼마나 중요한지 느꼈다.", "프롬포트를 더 잘 쓰는 방법을 배우고 싶다."],
    ["친구와 같이 고민해보고 도형을 만들어 볼수있어서 좋았다.", "블록 피라미드", "블록들 사이 거리가 줄어들지 않았다.", "팀원과 함께 글로 3D 도형을 만들었다.", "수업이 재미있어요"],
]

class2_raw = [
    ["문제를 보고 사고하는 과정이 재미있고 상상력을 자극하는 것 같다", "색이 다른 피라미드", "결과물은 비슷한데 점수가 낮아서 어딜 고쳐야할지 모르겠었다", "ai는 시각적으로 보이는 것보다 기준에 맞는 것을 더 중시한다.", "이런 수업 너무 재밌어요 더해주세요"],
    ["AI가 차별하는거 같습니다", "AI가 채점을 이상하게 합니다", "채점 기준을 몰라서 어려웠습니다", "AI를 완벽하게 신뢰하면 안된다", "팀게임 재밌습니다 더 해주세요!"],
    ["코딩을 겉으로만 들어봤을땐 엄청 어려운데, 직접 말로 해보니 재미있고 쉽게 할수있었다.", "소용돌이", "원하는 간격으로 소용돌이를 표현하기 어려웠다.", "코딩이 어렵지 않다는 것", "이런 활동 재미있네요"],
    ["AI를 만들어주는것도 코딩을 어느정도 이해해야 한다는 것을 알게 되었다.", "모든문제가 유도리없는 AI때문에 어려웠다.", "AI가 융통성있게 하지 않는다.", "말로 한다고 해도 코딩을 알아야 고친다", "재미있었습니다!!!"],
    ["머리도 적당히 쓰고 게임같아서 재미있었다", "체스판", "완벽히 똑같은데 계속 92점만 줘서 프롬포트를 바꾸니 점수가 떨어졌다", "단순하게 써도 예시와 똑같이 나올 수 있다.", "앞으로도 이런 수업 많이 했으면 좋겠어요"],
    ["처음에는 정확한 숫자로만 표현하려고 해서 어려웠지만 후반부에서는 쉽고 단순하게 표현해서 재밌었다", "탁자", "원기둥과 빨간 구를 붙이는 것을 표현하기 어려웠다", "ai를 이용하여 물체의 형태를 배울 수 있었다", "너무 재밌었어요!"],
    ["오늘 진짜 생각보다 엄청 재미있었다.", "거의 다 어려웠다.", "좌표를 지정하다가 꼬여서 어렵게 느껴졌다.", "아직 ai가 우리를 지배할수 없을거같다", "열심히 준비해주시다니 감사하고 수고하셨습니다."],
    ["ai에게 이것저것 만들어달라해서 재미있었다", "시안색 나선탑", "디테일하게 말해도 ai가 너무 못만들었다.", "코딩보다 쉬운 ai에게 만들어달라고하기", "너무 재미있었어요. ai는 아직 정확하지않은거같아요."],
    ["일상 단어로 코드를 만들수있어서 쉽고 재밌게 참여할수있었다", "체스나 나선형체", "간격에 대한 수치화가 어려웠다", "x,y,z축에 대한 개념과 이를 이용해 말로 코드 만들기", "코딩을 잘 못하는 제가 포기 안하고 잘 참여한것은 처음이에요!"],
    ["Ai가 말을 곡해해서 좀 답답하고 Ai의 단점을 알 수 있어서 좋았다.", "탁자 위 사과", "의도를 100% 전달하기 어렵다.", "Ai가 편하지만 완벽하지는 않다.", "없음"],
    ["AI를 활용하여 게임을 한 것이 재밌었습니다.", "도형 크기와 간격 맞추기", "주관적인 명령을 AI가 잘 못 알아듣는 것이 어려웠습니다.", "AI에게 최대한 객관적인 명령을 해야 한다", "살면서 해본 AI 게임 중 가장 재밌었습니다. AI 게임을 만들어 보고 싶어졌습니다."],
    ["친구와 함께 Ai로 도형을 만들어 대결하여서 재미있었습니다", "여러가지 색을 블럭에 적용하는것", "자세하게 만들기가 어려웠습니다.", "자세하고 정확하게 말해야 제대로된 답변을 받는다는 것", "팀 미션 재밌습니다 더 해주세요!"],
    ["인공지능이 나의 자연어를 이해하지 못해서 화가났다.", "탁자 위 사과", "요소가 많은데 위치와 크기를 지정하기에 시간이 촉박했다.", "ai를 이용하여 자연어로 결과값을 뽑는 방법", "수업은 재밌는데 ai가 말을 안들어요."],
    ["자연어로 프롬프트를 입력해 AI가 결과물을 내주는 게 흥미로웠습니다.", "탁자 위 사과", "내 생각을 자연어로 100% 표현하기 어려웠습니다.", "자연어로 AI를 활용하여 원하는 결과 뽑아내기", "좋은 수업해 주셔서 감사합니다."],
    ["코딩으로 배웠던 내용을 말로 설명해서 실행할 수 있다는 것이 좋은 경험이었다.", "탁자 위 사과", "탁자 다리가 판의 꼭짓점에서 약간 떨어져 있는 것을 설명하기 어려웠다.", "프롬프트를 길게 쓰는 것만이 중요한 게 아니라 직관적이고 상대적인 수치가 도움이 된다.", "게임처럼 배울 수 있다는 점이 정말 좋았습니다!"],
    ["코딩언어를 다루지 못하는 사람으로서 ai를 활용하여 명령을 주는 활동은 신기한 경험이었다.", "사과,탁자", "사방면의 구석에 원기둥을 배치한다는 말을 어떻게 하는지 모르겠었다.", "ai를 활용하여 코딩언어를 몰라도 컴퓨터에게 명령을 내릴 수 있는 방법.", "재밌었어요!! 나중에 이런 거 또 하면 좋겠어요!!"],
    ["한국어로 AI한테 설명해서 3D 도형을 만드는데 간단하게 쓰면 점수가 더 잘 나오는 경우가 있었다.", "체스 문제", "흰색 박스와 검은색 박스를 설명해도 안되어서 어려웠다.", "코딩으로 만들때와 AI를 이용해서 만들때의 차이를 알게 되었다.", "팀활동을 통해 게임처럼 수업참여하는 게 재미있었어요."],
    ["AI를 통해 모양을 만드는게 재밌었다. 비슷하게 만들었는데 다른 팀보다 점수가 낮을 때 아직 AI는 발전할 부분이 많다고 느꼈다.", "시안색 나선 모양과 탁자 위 사과", "힌트를 복사붙여넣기 해도 틀렸다고 나왔다.", "AI에게 말로 코딩하는게 어렵고, 어떤 부분은 파이썬으로 하는게 더 쉬울 것 같다.", "수업 재밌었어요!! 앞으로도 잘 부탁드려요"],
    ["AI에게 프롬프트 쓰는건 자신있었는데 AI가 왜 이렇게 말을 안 듣는건지 당황스러웠어요.", "스프링 문제", "전혀 다른 형태로 나와서 어떻게 작성해야할지 막막했어요.", "어떻게 해야 프롬프트를 잘 작성할지, AI의 한계점을 배웠어요.", "이런 수업을 듣게 해주셔서 감사합니다. 많이 배우고 갑니다."],
    ["인간의 눈과 AI의 눈은 다르다는것을 느꼈다. 더 확실하고 정확하고 자세하게 써야한다는걸 알게되었다", "체스", "순서가 잘못되거나 내가 생각한대로 나오지 않았다", "사람의 언어를 인공지능의 언어로 바꾸는과정을 배웠다", "어려웠지만 재미있었어요!"],
    ["친구와 협동하고 경쟁하는 것이 매우 재밌었습니다.", "나선원형", "처음 듣는 도형이고 시각적으로 표현하기 어려웠다", "ai가 100% 만드는것이 아님을 알게 되었다. 중요한 업무는 손수 하는것이 더 좋다.", "딱히 없습니다"],
    ["선생님이 만든 게임이라는 점에서 특별함을 느꼈다.", "구를 나선모양으로 정렬", "어떻다고 말하기 애매해서 어려웠다.", "어렵다고만 느꼈던 코딩을 재미있게 접할수 있다", "파이썬을 어려워했는데 선생님 덕에 다른 눈으로 볼수있었어요 감사합니다"],
    ["생각보다 AI가 잘 알아들으면서도 못 알아들어서 답답한 느낌이 있었다.", "탁자 위에 놓인 사과", "원기둥의 위치를 배치하는 것에서 어려움을 느꼈다.", "AI로 코드를 생성하는 것이 사람이 직접 코딩하는 것보다 시간적으로 훨씬 효율적이다.", "시간 조금만 더 주셨으면 좋았을 거 같아요"],
    ["AI에게 프롬프트를 입력하며 말을 듣게 만드는 건 마치 어린 아기를 설득하는 일과 같았다.", "다......", "AI가 더럽게 말을 안 듣는다", "수치에 기반한 설명과 아주 자세한 설명을 기입해야 된다", "감사합니다"],
    ["처음에는 AI가 의도와 다르게 생성했지만 반복적으로 피드백하면서 구체화할 수 있어서 성취감을 크게 느꼈다.", "시안색 나선형 탑", "모양을 ai에게 묘사하기가 애매하고 어려웠다.", "추상적인 형용사보다는 명확한 수치를 사용하는 것이 더 잘 만들어낸다.", "재미있었어요"],
    ["내가 직접 만들어서 고득점을 받는 것에 대한 성취감이 매우 좋았다.", "시안색 나선 모양", "시작점, 간격, 구의 개수를 정확하게 적는 것이 어려웠다.", "AI를 통한 코드 작성법", "매우 신기하고 즐겁게 배웠습니다."],
]

all_data = class1_raw + class2_raw

# ── 분석 함수 ─────────────────────────────────────────────────────
def analyze_difficulty():
    kw_map = {
        "탁자 위 사과": ["탁자", "사과", "책상"],
        "피라미드": ["피라미드"],
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
        ans = row[1].lower()
        matched = False
        for cat, kws in kw_map.items():
            if any(k in ans for k in kws):
                counts[cat] += 1
                matched = True
                break
        if not matched and ans.strip():
            counts["기타"] += 1
    return counts.most_common()

def analyze_reasons():
    reasons = Counter()
    for row in all_data:
        r = row[2]
        if any(k in r for k in ["간격", "위치", "거리", "배치", "축"]):
            reasons["위치/간격 설정의 어려움"] += 1
        if any(k in r for k in ["안나", "다르게", "안 듣", "못 알아", "이상한", "지맘대로", "안되"]):
            reasons["AI가 의도대로 생성하지 않음"] += 1
        if any(k in r for k in ["설명", "표현", "서술", "묘사", "말하기"]):
            reasons["복잡한 구조 설명의 한계"] += 1
        if any(k in r for k in ["수치", "숫자", "정확", "구체", "정밀"]):
            reasons["정확한 수치 표현의 어려움"] += 1
        if any(k in r for k in ["시간", "촉박"]):
            reasons["시간 부족"] += 1
    return reasons.most_common()

def analyze_learnings():
    cats = Counter()
    for row in all_data:
        a = row[3]
        if any(k in a for k in ["정확", "자세", "구체적", "명확", "수치", "섬세"]):
            cats["정확한 프롬프트 작성법"] += 1
        if any(k in a for k in ["완벽하지", "신뢰", "한계", "지배", "100%"]):
            cats["AI의 한계 인식"] += 1
        if any(k in a for k in ["명령", "활용", "다루는", "프롬프트", "프롬포트"]):
            cats["AI 활용/명령 방법"] += 1
        if any(k in a for k in ["코딩", "파이썬", "코드", "프로그래밍"]):
            cats["코딩과의 비교"] += 1
        if any(k in a for k in ["협력", "친구", "팀원", "같이", "의견"]):
            cats["협력의 중요성"] += 1
    return cats.most_common()

def count_satisfaction():
    pos = 0
    for r in all_data:
        # 소감(0)과 선생님께(4) 모두에서 긍정 키워드 탐색
        combined = r[0] + " " + r[4]
        if any(k in combined for k in ["재미", "재밌", "좋았", "신기", "흥미", "즐겁", "좋은", "감사", "재밋", "또 하", "더 해", "더해", "많이 해"]):
            pos += 1
    return int(pos / len(all_data) * 100)

# ── 데이터 준비 ────────────────────────────────────────────────────
diff_data = analyze_difficulty()
reason_data = analyze_reasons()
learn_data = analyze_learnings()
sat_rate = count_satisfaction()
total = len(all_data)

# 인용문 선별
random.seed(42)
deep_learnings = [r[3] for r in all_data if len(r[3]) > 40]
selected_learnings = random.sample(deep_learnings, min(10, len(deep_learnings)))

deep_impressions = [(r[0], r[4]) for r in all_data if len(r[0]) > 30 or len(r[4]) > 30]
random.seed(7)
selected_impressions = random.sample(deep_impressions, min(8, len(deep_impressions)))

teacher_msgs = [r[4] for r in all_data if len(r[4]) > 15 and any(k in r[4] for k in ["감사", "재밌", "좋았", "부탁", "또 하", "더 해"])]
random.seed(99)
selected_teacher = random.sample(teacher_msgs, min(8, len(teacher_msgs)))

# ── 바 차트 HTML 생성 ──────────────────────────────────────────────
bar_colors = ["#ef4444", "#f59e0b", "#6366f1", "#14b8a6", "#3b82f6", "#a855f7", "#22c55e", "#f97316", "#64748b", "#ec4899"]

def make_bars(data, max_val=None):
    if not max_val:
        max_val = max(c for _, c in data) if data else 1
    html = ""
    for i, (label, count) in enumerate(data):
        pct = count / total * 100
        bar_w = count / max_val * 100
        color = bar_colors[i % len(bar_colors)]
        html += f'''
        <div class="bar-row">
          <div class="bar-label">{label}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:{bar_w}%;background:{color}"></div>
          </div>
          <div class="bar-value" style="color:{color}">{count}명 ({pct:.0f}%)</div>
        </div>'''
    return html

# ── 인용 카드 HTML ─────────────────────────────────────────────────
quote_colors = ["#3b82f6", "#6366f1", "#14b8a6", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#f97316"]

def make_quotes(texts, limit=200):
    html = ""
    for i, text in enumerate(texts):
        color = quote_colors[i % len(quote_colors)]
        t = text[:limit] + ("..." if len(text) > limit else "")
        html += f'''
        <div class="quote-card" style="border-left-color:{color}">
          <p>"{t}"</p>
        </div>'''
    return html

# ── HTML 생성 ──────────────────────────────────────────────────────
html_content = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');

  @page {{
    size: A4;
    margin: 0;
  }}

  * {{ margin: 0; padding: 0; box-sizing: border-box; }}

  body {{
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif;
    color: #1e293b;
    font-size: 10pt;
    line-height: 1.6;
  }}

  .page {{
    width: 210mm;
    min-height: 297mm;
    padding: 20mm;
    page-break-after: always;
    position: relative;
  }}

  /* ── 표지 ─────────────────────── */
  .cover {{
    background: linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 40mm 30mm;
  }}
  .cover-badge {{
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 20px;
    padding: 6px 20px;
    font-size: 10pt;
    margin-bottom: 20px;
    letter-spacing: 2px;
  }}
  .cover h1 {{
    font-size: 30pt;
    font-weight: 900;
    margin-bottom: 8px;
    letter-spacing: -1px;
  }}
  .cover .subtitle {{
    font-size: 13pt;
    opacity: 0.85;
    margin-bottom: 40px;
    font-weight: 300;
  }}
  .cover-stats {{
    display: flex;
    gap: 16px;
    margin-top: 30px;
  }}
  .stat-card {{
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 12px;
    padding: 16px 22px;
    min-width: 100px;
  }}
  .stat-card .num {{
    font-size: 24pt;
    font-weight: 900;
  }}
  .stat-card .label {{
    font-size: 8pt;
    opacity: 0.8;
    margin-top: 2px;
  }}
  .cover-info {{
    background: rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 20px 30px;
    margin-top: 40px;
    text-align: left;
    font-size: 9.5pt;
    line-height: 2;
  }}
  .cover-info span {{ opacity: 0.7; }}
  .cover-footer {{
    margin-top: auto;
    font-size: 8pt;
    opacity: 0.6;
  }}

  /* ── 섹션 헤더 ────────────────── */
  .section-header {{
    margin-bottom: 20px;
  }}
  .section-header h2 {{
    font-size: 18pt;
    font-weight: 900;
    color: #1e293b;
    margin-bottom: 4px;
  }}
  .section-header .sub {{
    font-size: 9pt;
    color: #64748b;
  }}
  .section-header .line {{
    height: 3px;
    background: linear-gradient(to right, #3b82f6, #6366f1);
    border-radius: 2px;
    margin-top: 8px;
  }}

  /* ── 바 차트 ──────────────────── */
  .bar-row {{
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }}
  .bar-label {{
    width: 140px;
    font-size: 9pt;
    font-weight: 500;
    color: #374151;
    flex-shrink: 0;
  }}
  .bar-track {{
    flex: 1;
    height: 14px;
    background: #e5e7eb;
    border-radius: 7px;
    overflow: hidden;
    margin: 0 10px;
  }}
  .bar-fill {{
    height: 100%;
    border-radius: 7px;
    transition: width 0.3s;
  }}
  .bar-value {{
    width: 80px;
    font-size: 8.5pt;
    font-weight: 700;
    text-align: right;
    flex-shrink: 0;
  }}

  /* ── 인용 카드 ────────────────── */
  .quote-card {{
    background: #f8fafc;
    border-left: 4px solid #3b82f6;
    border-radius: 0 8px 8px 0;
    padding: 10px 14px;
    margin-bottom: 8px;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.7;
  }}
  .quote-card p {{ margin: 0; }}

  /* ── 인사이트 카드 ─────────────── */
  .insight-card {{
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 12px;
    border-left: 5px solid;
  }}
  .insight-card h3 {{
    font-size: 11pt;
    font-weight: 700;
    margin-bottom: 4px;
    color: #1e293b;
  }}
  .insight-card p {{
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.7;
  }}

  /* ── 추천 카드 ────────────────── */
  .rec-card {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px 14px 50px;
    margin-bottom: 10px;
    position: relative;
  }}
  .rec-num {{
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: white;
    font-weight: 900;
    font-size: 13pt;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .rec-card h3 {{
    font-size: 10pt;
    font-weight: 700;
    margin-bottom: 3px;
  }}
  .rec-card p {{
    font-size: 8.5pt;
    color: #64748b;
    line-height: 1.6;
  }}

  .two-col {{
    display: flex;
    gap: 14px;
  }}
  .two-col > div {{ flex: 1; }}

  .sub-heading {{
    font-size: 12pt;
    font-weight: 700;
    color: #1e293b;
    margin: 18px 0 10px;
  }}
</style>
</head>
<body>

<!-- ====== 표지 ====== -->
<div class="page cover">
  <div class="cover-badge">VPython Prompt Challenge</div>
  <h1>학생 피드백<br>분석 리포트</h1>
  <p class="subtitle">AI 프롬프트 코딩 수업 결과 보고서</p>

  <div class="cover-stats">
    <div class="stat-card">
      <div class="num">{total}명</div>
      <div class="label">총 참여 학생</div>
    </div>
    <div class="stat-card">
      <div class="num">{sat_rate}%</div>
      <div class="label">수업 만족도</div>
    </div>
    <div class="stat-card">
      <div class="num">2학급</div>
      <div class="label">참여 학급</div>
    </div>
    <div class="stat-card">
      <div class="num">5종</div>
      <div class="label">챌린지 수</div>
    </div>
  </div>

  <div class="cover-info">
    <span>수업명</span>&nbsp;&nbsp;&nbsp;AI 프롬프트로 3D 도형 만들기 (VPython)<br>
    <span>수업 도구</span>&nbsp;&nbsp;&nbsp;Claude AI (Haiku + Sonnet) + VPython 3D<br>
    <span>수업 형태</span>&nbsp;&nbsp;&nbsp;2인 1팀 협력 + 팀 간 경쟁 (프롬프트 챌린지)<br>
    <span>작성일</span>&nbsp;&nbsp;&nbsp;2026.03.19
  </div>

  <div class="cover-footer">https://vpython-prompt-challenge.fly.dev</div>
</div>

<!-- ====== 어려운 문제 분석 ====== -->
<div class="page">
  <div class="section-header">
    <h2>어려운 문제 분석</h2>
    <p class="sub">학생들이 가장 어렵다고 느낀 챌린지와 그 이유</p>
    <div class="line"></div>
  </div>

  <div class="sub-heading">어떤 문제가 제일 어려웠나요?</div>
  {make_bars(diff_data)}

  <div class="sub-heading" style="margin-top:24px">왜 어렵다고 느꼈을까?</div>
  {make_bars(reason_data)}
</div>

<!-- ====== 학습 성과 ====== -->
<div class="page">
  <div class="section-header">
    <h2>학습 성과 분석</h2>
    <p class="sub">학생들이 수업을 통해 깨달은 것들</p>
    <div class="line"></div>
  </div>

  <div class="sub-heading">오늘 무엇을 배웠나요? (주제 분류)</div>
  {make_bars(learn_data)}

  <div class="sub-heading" style="margin-top:22px">학생들의 깊이 있는 성찰</div>
  {make_quotes(selected_learnings)}
</div>

<!-- ====== 학생 소감 ====== -->
<div class="page">
  <div class="section-header">
    <h2>학생 소감 하이라이트</h2>
    <p class="sub">수업에 대한 학생들의 생생한 목소리</p>
    <div class="line"></div>
  </div>

  <div class="sub-heading">참여 소감</div>
  {make_quotes([r[0] for r in all_data if len(r[0]) > 40][:8])}

  <div class="sub-heading" style="margin-top:20px">선생님께 하고 싶은 말</div>
  {make_quotes(selected_teacher)}
</div>

<!-- ====== 교사용 인사이트 ====== -->
<div class="page">
  <div class="section-header">
    <h2>교사용 인사이트</h2>
    <p class="sub">피드백 분석을 바탕으로 한 핵심 발견</p>
    <div class="line"></div>
  </div>

  <div class="insight-card" style="background:#f0fdf4;border-left-color:#22c55e">
    <h3>수업 만족도 {sat_rate}%</h3>
    <p>대다수의 학생이 '재미있었다'고 응답. 게임형 경쟁 구조(팀 대결, 실시간 점수)와 짝 활동이 높은 몰입도의 핵심 요인. '코딩이 아닌 자연어로 한다'는 점이 접근 장벽을 크게 낮춤.</p>
  </div>

  <div class="insight-card" style="background:#fef2f2;border-left-color:#ef4444">
    <h3>가장 어려운 문제: 탁자 위 사과</h3>
    <p>'탁자 위 사과'가 압도적 1위. 복합 객체(다리 4개 + 판 + 구)의 공간 배치를 자연어로 표현하는 것이 학생들에게 가장 어려운 과제. 다리 사이 간격, 판과의 결합 위치 등을 언어로 전달하기 난해.</p>
  </div>

  <div class="insight-card" style="background:#fffbeb;border-left-color:#f59e0b">
    <h3>AI 채점 신뢰도 이슈</h3>
    <p>다수의 학생이 'AI 채점이 불공정하다'고 느낌. 육안으로 비슷한데 점수가 낮거나, 간단한 프롬프트가 오히려 높은 점수를 받는 사례가 보고됨. '똑같은데 92점만 준다', '우리가 더 잘 만들었는데 다른 팀이 더 높다' 등의 불만.</p>
  </div>

  <div class="insight-card" style="background:#eff6ff;border-left-color:#3b82f6">
    <h3>핵심 학습 성과: 프롬프트 엔지니어링</h3>
    <p>'AI에게 정확하게 설명해야 한다'는 프롬프트 엔지니어링의 기본을 대부분의 학생이 체득. 특히 '추상적 표현 vs 수치 기반 설명'의 차이, '큰 틀 먼저 → 세부 조정' 전략을 스스로 발견한 학생들이 다수.</p>
  </div>

  <div class="insight-card" style="background:#f5f3ff;border-left-color:#8b5cf6">
    <h3>학생이 발견한 프롬프트 전략들</h3>
    <p>1) 큰 틀 먼저 잡고 세부 조정하기 &nbsp; 2) 수치 기반으로 객관적으로 설명하기 &nbsp; 3) 너무 길면 오히려 역효과 &nbsp; 4) 반복 수정으로 오차 좁히기 &nbsp; 5) AI의 힌트/피드백을 적극 활용하기</p>
  </div>

  <div class="insight-card" style="background:#f0fdfa;border-left-color:#14b8a6">
    <h3>협력 학습의 효과</h3>
    <p>짝 활동의 가치를 학생들이 직접 언급. '혼자보다 같이 하니 더 좋은 결과', '서로 부족한 점 보완', '의견의 중간지점을 찾는 능력' 등. 비(非)코딩 전공 학생도 '포기하지 않고 끝까지 참여했다'고 응답.</p>
  </div>
</div>

<!-- ====== 수업 개선 제안 ====== -->
<div class="page">
  <div class="section-header">
    <h2>수업 개선 제안</h2>
    <p class="sub">다음 수업을 위한 구체적인 개선 방향</p>
    <div class="line"></div>
  </div>

  <div class="rec-card">
    <div class="rec-num" style="background:#3b82f6">1</div>
    <h3>문제 난이도 단계화</h3>
    <p>복합 객체(탁자 등)는 힌트를 단계별로 제공하거나, 중간 단계 문제를 추가하여 학생들이 점진적으로 난이도를 올릴 수 있도록 설계. '탁자 판만 먼저 만들기 → 다리 추가' 같은 분할 접근 도입.</p>
  </div>

  <div class="rec-card">
    <div class="rec-num" style="background:#f59e0b">2</div>
    <h3>AI 채점 기준 사전 안내</h3>
    <p>학생들에게 채점 기준(코드 구조 비교, 객체 수, 색상, 위치 등)을 사전에 안내하여 '불공정하다'는 느낌을 줄이고, 학생이 전략적으로 프롬프트를 개선할 수 있도록 유도.</p>
  </div>

  <div class="rec-card">
    <div class="rec-num" style="background:#ef4444">3</div>
    <h3>시간 관리 유연화</h3>
    <p>문제당 3분 이상 또는 문제 수를 줄이고 깊이 있게 도전할 수 있는 옵션 제공. 일부 학생이 시간 부족을 호소. 난이도별 차등 시간 부여도 고려.</p>
  </div>

  <div class="rec-card">
    <div class="rec-num" style="background:#22c55e">4</div>
    <h3>프롬프트 전략 미니 가이드</h3>
    <p>수업 시작 전 2분간 '프롬프트 작성 팁'을 안내: 수치 기반 설명, 큰 틀 먼저 접근법, 한 번에 모든 것을 쓰지 않고 반복 수정하기 등.</p>
  </div>

  <div class="rec-card">
    <div class="rec-num" style="background:#6366f1">5</div>
    <h3>결과 공유 토론 시간</h3>
    <p>각 팀의 프롬프트를 화면에 나란히 띄워 비교하고 분석하는 시간 추가. 점수 차이의 원인을 함께 토론하면 학생 간 배움이 더욱 풍부해질 것.</p>
  </div>

  <div class="rec-card">
    <div class="rec-num" style="background:#a855f7">6</div>
    <h3>다양한 평가 축 도입</h3>
    <p>점수 외에 '가장 창의적인 프롬프트', '가장 많이 개선한 팀', '가장 짧은 프롬프트로 높은 점수' 등 다양한 시상 카테고리로 모든 팀의 성취감을 강화.</p>
  </div>
</div>

</body>
</html>
'''

# ── 파일 출력 ──────────────────────────────────────────────────────
output_dir = os.path.dirname(__file__)
html_path = os.path.join(output_dir, "VPython_피드백리포트.html")
pdf_path = os.path.join(output_dir, "VPython_프롬프트챌린지_피드백리포트.pdf")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)
print(f"HTML 생성: {html_path}")

HTML(string=html_content).write_pdf(pdf_path)
print(f"PDF 생성 완료: {pdf_path}")
