"""Intent classifier for Daedalus messages."""
# -*- coding: utf-8 -*-

import re
import hashlib
from dataclasses import dataclass
from typing import Optional


# --- Cached LLM service interface ---
class _LLMWrapper:
    """Minimal async interface for the LLM service. Compatible with LLMService."""
    def __init__(self, llm_service=None):
        self._llm = llm_service  # set manually if available

    async def chat(self, messages):
        if self._llm:
            return await self._llm.chat(messages)
        # Fallback: just return the user content as-is
        return messages[-1]["content"] if messages else ""


@dataclass
class IntentResult:
    """Result of intent classification."""
    intent: str  # "chat" | "task" | "unknown"
    confidence: float  # 0.0 - 1.0
    reason: str  # human-readable reason
    task_count: int = 0  # estimated task count
    is_fast: bool = False  # True if decided by heuristic (fast path)


class IntentClassifier:
    """Classify user input intent with fast heuristic + LLM fallback.
    
    Usage:
        classifier = IntentClassifier(llm_service)
        result = await classifier.classify("Write a Python script to clean data")
        if result.intent == "chat":
            return await llm.chat(user_messages)  # fast path
        else:
            return await chat_engine.process_workflow(user_messages)  # pipeline
    """

    # --- Lexical signals (fast path) ---
    # Patterns that strongly suggest "chat"
    CHAT_PATTERNS = [
        # Greetings / Small talk
        r'^(안녕|hello|hi|hey|반갑|처음|잘부탁|하이|안녀)',
        # Emotions / Conversations about state
        r'^(좋아|재미있|우려|슬피|행복|기쁨|화나|속상|피곤|잠가|귀찮)',
        # Simple questions about self/history
        r'^(너는|당신은|누구야|너의이름|누구래|너의역할|who are you|i am|hows it)',
        # Thanks / Farewell
        r'^(감사|고마|thanks|thank you|thx|tx|bye|안녕가|잘가|다음에|만나)',
        # Simple yes/no / acknowledgment
        r'^(네|예|아니|아니요|맞아|그럼|그래|좋아|알겠|확인|확인됨|ok|okay)',
        # Simple requests (no complex structure)
        r'^(왜|어떻게|무엇이|언제|어디|얼마나)?\s*(이유|방법|이름|시간|장소|얼마)\s*(이니|한게|에요|야|\?)$',
        # Korean particles that indicate casual speech
        r'^(하긴|그래도|아마|어쩌면|혹시|아니지만|저런데|하지만|그런데|다만|그래서|그러니까)',
        # Opinion / speculation (common in chat)
        r'^(~라고생각해|~라고해|~인듯해|~같아|~일거야|~ㄴ가|~ㄹ까|\?(?:.*\?)?)$',
        # Questions ending with ? in middle/end
        r'^.+?\?$',
        r'^[?.!]{1,3}$',
    ]

    # Patterns that strongly suggest "task"
    TASK_PATTERNS = [
        r'(쓰|작성|생성|만들|구축|설계|제작|개발|실장|implement|write|create|build|code)',
        r'(분석|evaluate|조사|연구|review|비교|분석해|분석하세요)',
        r'(스크립트|스케줄|워크플로우|pipeline|프로세스|automation|자동화)',
        r'(파일|파일명|폴더|디렉토리|경로|구조|tree|ls|grep|find)',
        r'(데이터|csv|json|xml|yaml|excel|엑셀|db|database|데이터베이스|저장|저장소)',
        r'(서버|데플|config|설정|환경변수|환경설정|setup|install|설치|빌드|build)',
        r'(테스트|검사|debug|디버깅|에러|에러처리|검증|검토|verify|validate|vld)',
        r'(플로우|흐름|단계|과정|순서|프로세스|[0-9]+.*단계|[0-9]+.*단계)',
        r'(프로젝트|프로젝트명|프로젝트구조|프로젝트설계|project|design|design)',
        r'(명세|스펙|spec|조건|Requirement|requirement|필수|조건사항)',
        r'(실행|실행방법|실행결과|실행후|실행후|수행|수행결과|수행후|수행후)',
        r'(전달|전송|send|receive|출력|출력결과|print|출력하기|전달해|전달하세요)',
        r'(저장|저장결과|save|store|저장해|저장하세요|저장하기|저장후|저장하고)',
        r'(검토|review|검토후|검토하고|검토해|검토하세요|review|검토|검토후)',
        r'(완료|완료상태|완료됨|완료여부|finish|complete|완료|완료됨)',
        r'(생성|생성후|생성하고|생성해주세요|생성하세요|generate|생성|생성결과)',
        r'(검색|검색결과|search|searching|검색|검색후|검색하고|검색해|검색하세요)',
        r'(변경|변경결과|변경후|변경하고|변경해|변경하세요|change|modify|변경|변경후)',
        r'(삭제|삭제결과|삭제후|삭제하고|삭제해|삭제하세요|delete|remove|삭제|삭제후)',
        r'(수정|수정결과|수정후|수정하고|수정해|수정하세요|modify|수정|수정후)',
        r'(복사|복사결과|복사후|복사하고|복사해|복사하세요|copy|복사|복사후)',
        r'(이동|이동결과|이동후|이동하고|이동해|이동하세요|move|이동|이동후)',
        r'(수정|수정후|수정해|수정하세요|modify|수정후|수정하고|수정결과)',
        r'(실행|수행|실행후|수행후|실행해|실행하세요|수행해|수행하세요|perform|수행)',
        r'(구현|구현후|구현해|구현하세요|implement|구현후|구현하고|구현결과)',
    ]

    # Task indicators → estimate sub-task count
    TASK_INDICATORS = [
        r'(단계|step|레벨|phase)',
        r'(파일|file|파일명|filename)',
        r'(테스트|검증|확인|verify)',
        r'(문서|문서작성|문서화|document|document)',
    ]

    # --- Confidence thresholds ---
    CHAT_CONFIDENCE = 0.85
    TASK_CONFIDENCE = 0.80
    LLM_DELEGATION_CONFIDENCE = 0.65

    # --- Cache for repeated queries ---
    _cache: dict[str, IntentResult] = {}
    _max_cache_size = 1000

    def __init__(self, llm_service=None):
        self._llm = llm_service

    async def classify(self, content: str) -> IntentResult:
        """Classify the intent of the user's input.
        
        Strategy:
        1. Check cache
        2. Fast heuristic pattern matching
        3. LLM delegation for ambiguous cases
        """
        # Cache hit
        cache_key = self._cache_key(content)
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Fast path: heuristic patterns
        result = self._classify_by_heuristic(content)
        if result.intent in ("chat", "task"):
            self._cache[cache_key] = result
            return result

        # Ambiguous → delegate to LLM
        if self._llm:
            result = await self._classify_by_llm(content)
        else:
            result = IntentResult("unknown", 0.5, "No LLM available for classification")

        self._cache[cache_key] = result
        return result

    def _classify_by_heuristic(self, content: str) -> IntentResult:
        """Classify using heuristic patterns. Returns (chat, task) or unknown."""
        cleaned = content.strip()
        
        # 1. Chat patterns (fast path)
        for pattern in self.CHAT_PATTERNS:
            if re.search(pattern, cleaned, re.IGNORECASE):
                return IntentResult(
                    "chat", 0.85 + 0.1, f"matched pattern: {pattern}"
                )

        # 2. Task patterns
        task_score = 0
        task_patterns_matched = 0
        for pattern in self.TASK_PATTERNS:
            matches = re.findall(pattern, cleaned, re.IGNORECASE)
            if matches:
                task_patterns_matched += len(matches)
                # Weight: longer matches = stronger signal
                task_score += sum(len(m) for m in matches) / max(1, len(cleaned))
        
        # Boost if multiple task patterns match
        if task_patterns_matched >= 1:
            task_score *= 1.5
        
        if task_score >= self.TASK_CONFIDENCE:
            estimated_tasks = min(task_patterns_matched, 5)
            return IntentResult(
                "task",
                round(min(task_score, 1.0), 2),
                f"task patterns matched: {task_patterns_matched}, score: {task_score:.2f}"
            )

        # Fallback to unknown
        return IntentResult("unknown", 0.5, "no clear signal, score: {task_score:.2f}")

    async def _classify_by_llm(self, content: str) -> IntentResult:
        """Delegate to LLM for ambiguous cases."""
        system_prompt = """You are an intent classifier for a task orchestration system.
Classify whether the user input is:
- "chat": casual conversation, greeting, small talk, simple question, no task needed
- "task": request requiring action, work, analysis, code generation, data processing, etc.

Rules:
- If it has no clear action or is casual, return "chat"
- If it requests anything to create, analyze, generate, modify, execute, research, review, etc., return "task"

Respond ONLY with: {"intent": "chat"|"task", "confidence": 0.0-1.0, "reason": "short explanation"}"""

        user_messages = [{"role": "user", "content": f"Input: {content}"}]
        response = await self._llm.chat([
            {"role": "system", "content": system_prompt},
            *user_messages
        ])

        # Parse JSON from LLM response
        try:
            import json
            data = json.loads(response)
            return IntentResult(
                intent=data.get("intent", "unknown"),
                confidence=data.get("confidence", 0.5),
                reason=data.get("reason", "LLM classification"),
                is_fast=False
            )
        except (json.JSONDecodeError, KeyError, AttributeError):
            return IntentResult("task", 0.65, "LLM default fallback to task mode")

    def _cache_key(self, content: str) -> str:
        """Fast cache key (hash)."""
        return hashlib.md5(content.lower().strip().encode()).hexdigest()[:16]
