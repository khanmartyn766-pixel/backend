#!/usr/bin/env python3
"""Build a normalized question bank JSON from docx files."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional


DOCX_FILES = [
    "/Users/apple/Documents/第一章心理学概述.docx",
    "/Users/apple/Documents/心理学题库/第二章 注意习题答案.docx",
    "/Users/apple/Documents/心理学题库/第三章感知觉习题答案.docx",
    "/Users/apple/Documents/心理学题库/第四章记忆习题答案.docx",
    "/Users/apple/Documents/心理学题库/第五章想象分考点习题答案.docx",
    "/Users/apple/Documents/心理学题库/第六章思维分考点习题答案.docx",
    "/Users/apple/Documents/心理学题库/第七章 情绪与情感 分考点答案.docx",
    "/Users/apple/Documents/心理学题库/第八章 意志习题答案.docx",
    "/Users/apple/Documents/心理学题库/第九章个性倾向性习题答案.docx",
    "/Users/apple/Documents/心理学题库/第十章个性心理特征习题答案.docx",
]

OUT_JSON = Path("/Users/apple/Downloads/专升本/seed_bank.json")
OUT_REPORT = Path("/Users/apple/Downloads/专升本/seed_bank_report.txt")
SEED_VERSION = "psych-seed-2026-02-28-v2"


def clean_line(text: str) -> str:
    text = (
        text.replace("\ufeff", "")
        .replace("\u200f", "")
        .replace("\u200e", "")
        .replace("\xa0", " ")
        .replace("\t", " ")
    )
    text = re.sub(r"^[\s•·▪●\-–—]+\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def chapter_from_path(path: str) -> str:
    name = Path(path).stem
    # Keep "第X章..." if present, otherwise fallback to file stem.
    m = re.search(r"(第[一二三四五六七八九十百千万0-9]+章[^ ]*)", name)
    if m:
        return m.group(1).strip()
    return name.strip()


def qtype_from_label(label: str) -> str:
    label = label.strip()
    if "多选" in label or "多项" in label:
        return "multiple"
    if "判断" in label:
        return "judge"
    if "简答" in label or "论述" in label or "问答" in label:
        return "short"
    if "单选" in label or "单项" in label:
        return "single"
    return "single"


def strip_leading_question_index(text: str) -> str:
    return re.sub(
        r"^\s*(?:[（(]?\s*(?:\d+|[一二三四五六七八九十]+)\s*[）)]?\s*[\.、．]?)\s*",
        "",
        text,
        count=1,
    )


def is_answer_line(text: str) -> bool:
    return bool(
        re.match(
            r"^(?:【?\s*(?:正确)?(?:参考)?答案(?:要点)?\s*】?|(?:正确)?(?:参考)?答案(?:要点)?)",
            text,
        )
    )


def is_explanation_line(text: str) -> bool:
    return bool(re.match(r"^(?:【?\s*解析\s*】?|解析)\b", text))


def looks_like_unlabeled_option(text: str) -> bool:
    if not text or len(text) > 40:
        return False
    if re.search(r"[。！？；：:]", text):
        return False
    if re.search(r"(答案|解析|考点|第[一二三四五六七八九十百千万0-9]+章)", text):
        return False
    if re.match(r"^\d", text):
        return False
    return True


def extract_docx_text(path: str) -> str:
    result = subprocess.run(
        ["textutil", "-convert", "txt", "-stdout", path],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def split_inline_options(line: str) -> List[tuple[str, str]]:
    # e.g. "A.xxx B.xxx C.xxx"
    matches = list(re.finditer(r"([A-H])[\.\、\)）．:：]\s*", line))
    if len(matches) >= 2:
        options: List[tuple[str, str]] = []
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(line)
            key = m.group(1)
            text = clean_line(line[start:end])
            if text:
                options.append((key, text))
        return options

    # fallback: "A xxx B xxx"
    matches = list(re.finditer(r"(?:^|\s)([A-H])\s+", line))
    if len(matches) >= 2:
        options = []
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(line)
            key = m.group(1)
            text = clean_line(line[start:end])
            if text:
                options.append((key, text))
        return options
    return []


def split_stem_and_options(stem: str) -> tuple[str, List[tuple[str, str]]]:
    options = split_inline_options(stem)
    if len(options) < 2:
        return stem, []

    marker = re.search(r"([A-H])[\.\、\)）．:：]\s*|(?:^|\s)([A-H])\s+", stem)
    if not marker:
        return stem, options

    pure_stem = clean_line(stem[: marker.start()])
    return (pure_stem or stem), options


def split_option_text_and_tail(text: str) -> tuple[str, str]:
    marker = re.search(
        r"(?:【?\s*(?:正确)?(?:参考)?答案(?:要点)?\s*】?|(?:正确)?(?:参考)?答案(?:要点)?\s*[:：]|【案例分析】|案例分析)",
        text,
    )
    if not marker:
        return text.strip(), ""
    return text[: marker.start()].strip(), text[marker.start() :].strip()


def parse_answer_line(text: str) -> tuple[str, str]:
    # returns answer_text, explanation_fragment
    # e.g. "A。解析：xxx"
    answer_text = text
    explanation = ""
    split = re.split(r"(?:【?解析】?|解析)\s*[:：]", text, maxsplit=1)
    if len(split) == 2:
        answer_text, explanation = split[0].strip(), split[1].strip()
    answer_text = re.sub(r"^[】\]\s]+", "", answer_text).strip()
    answer_text = re.sub(r"^(?:答案要点|答案|参考答案|正确答案)\s*[:：]?\s*", "", answer_text)
    answer_text = answer_text.strip("。;； ")
    return answer_text, explanation


def parse_objective_answer(answer_text: str, qtype_hint: str) -> List[str]:
    raw = answer_text.upper().replace("、", "").replace("，", "").replace(",", "")
    letters = re.findall(r"[A-H]", raw)
    if letters:
        return sorted(set(letters))

    if qtype_hint == "judge" or re.search(r"(对|错|正确|错误|√|×|T|F|Y|N)", answer_text, re.I):
        if re.search(r"(对|正确|√|\bT\b|\bY\b)", answer_text, re.I):
            return ["A"]
        if re.search(r"(错|错误|×|\bF\b|\bN\b)", answer_text, re.I):
            return ["B"]
    return []


@dataclass
class RawQuestion:
    source_file: str
    chapter: str
    topic: str
    qtype: str
    stem: str
    options: List[tuple[str, str]] = field(default_factory=list)
    answer_text: str = ""
    explanation: str = ""
    mode: str = "stem"

    def add_line(self, line: str) -> None:
        if self.mode == "answer":
            self.answer_text = f"{self.answer_text} {line}".strip()
        elif self.mode == "explanation":
            self.explanation = f"{self.explanation} {line}".strip()
        elif self.options:
            # multiline option continuation
            key, text = self.options[-1]
            self.options[-1] = (key, f"{text} {line}".strip())
        else:
            self.stem = f"{self.stem} {line}".strip()


def parse_file(path: str) -> List[RawQuestion]:
    text = extract_docx_text(path)
    lines = [clean_line(x) for x in text.splitlines()]
    chapter = chapter_from_path(path)
    topic = ""
    section_type_hint = "single"
    questions: List[RawQuestion] = []
    current: Optional[RawQuestion] = None

    qtype_pattern = r"(单选题?|单项选择题?|多选题?|多项选择题?|判断题?|简答题?|论述题?|问答题?)"

    def flush_current() -> None:
        nonlocal current
        if current is not None:
            questions.append(current)
            current = None

    q_start = re.compile(rf"^(\d+)\s*[\.、]?\s*【\s*{qtype_pattern}\s*】\s*(.+)$")
    q_start_prefix = re.compile(rf"^[（(]\s*{qtype_pattern}\s*[）)]\s*(\d+)\s*[\.、]?\s*(.+)$")
    q_start_no_index = re.compile(rf"^【\s*{qtype_pattern}\s*】\s*(.+)$")
    q_section_only = re.compile(rf"^[（(]?\s*{qtype_pattern}\s*[）)]\s*$")

    def start_question(qtype: str, stem: str) -> RawQuestion:
        mode = "answer" if qtype == "short" else "stem"
        return RawQuestion(
            source_file=Path(path).name,
            chapter=chapter,
            topic=topic,
            qtype=qtype,
            stem=stem.strip(),
            mode=mode,
        )

    for line in lines:
        if not line:
            continue
        line_no_idx = strip_leading_question_index(line)

        if re.match(r"^第[一二三四五六七八九十百千万0-9]+章", line):
            chapter = line
            continue
        if re.match(r"^考点[一二三四五六七八九十0-9]", line):
            topic = line
            continue

        section_line = q_section_only.match(line_no_idx)
        if section_line:
            section_type_hint = qtype_from_label(section_line.group(1))
            continue

        m = q_start.match(line)
        if m:
            flush_current()
            section_type_hint = qtype_from_label(m.group(2))
            current = start_question(section_type_hint, m.group(3))
            continue

        m_prefix = q_start_prefix.match(line_no_idx)
        if m_prefix:
            flush_current()
            section_type_hint = qtype_from_label(m_prefix.group(1))
            current = start_question(section_type_hint, m_prefix.group(3))
            continue

        m_no_index = q_start_no_index.match(line_no_idx)
        if m_no_index:
            flush_current()
            section_type_hint = qtype_from_label(m_no_index.group(1))
            current = start_question(section_type_hint, m_no_index.group(2))
            continue

        # fallback for missing type marker, only when blank option is present "( )"
        m2 = re.match(r"^(\d+)\s*[\.、]?\s*(.+)$", line)
        if m2 and re.search(r"[（(]\s*[）)]", m2.group(2)):
            if not is_answer_line(line_no_idx) and not is_explanation_line(line_no_idx):
                if current is not None:
                    flush_current()
                current = start_question(section_type_hint or "single", m2.group(2))
                continue

        if current is None:
            continue

        # answer line
        answer_match = re.match(
            r"^(?:【?\s*(?:正确)?(?:参考)?答案(?:要点)?\s*】?|(?:正确)?(?:参考)?答案(?:要点)?)\s*[:：]?\s*(.*)$",
            line_no_idx,
        )
        if answer_match:
            ans_text, exp = parse_answer_line(answer_match.group(1).strip())
            if ans_text:
                current.answer_text = ans_text
            if exp:
                current.explanation = exp
                current.mode = "explanation"
            else:
                current.mode = "answer"
            continue

        # explanation line
        explanation_match = re.match(r"^(?:【?\s*解析\s*】?|解析)\s*[:：]?\s*(.*)$", line_no_idx)
        if explanation_match:
            part = explanation_match.group(1).strip()
            current.explanation = f"{current.explanation} {part}".strip()
            current.mode = "explanation"
            continue

        if current.mode not in {"answer", "explanation"}:
            # options
            inline_opts = split_inline_options(line)
            if not inline_opts and line_no_idx != line:
                inline_opts = split_inline_options(line_no_idx)
            if inline_opts:
                current.options.extend(inline_opts)
                current.mode = "options"
                continue

            option_single = re.match(r"^([A-H])(?:[\.\、\)）．:：]|\s+)\s*(.+)$", line_no_idx)
            if option_single:
                current.options.append((option_single.group(1), option_single.group(2).strip()))
                current.mode = "options"
                continue

            # Some docs list options as plain lines without A/B/C prefix.
            if (
                current.qtype in {"single", "multiple", "judge"}
                and ("(" in current.stem or "（" in current.stem)
                and looks_like_unlabeled_option(line_no_idx)
                and len(current.options) < 8
            ):
                key = chr(ord("A") + len(current.options))
                if "A" <= key <= "H":
                    current.options.append((key, line_no_idx.strip()))
                    current.mode = "options"
                    continue

        # next question by explicit index + type marker in line
        if re.match(r"^\d+\s*[\.、]?\s*【", line):
            flush_current()
            continue

        current.add_line(line)

    flush_current()
    return questions


def normalize_questions(raw_questions: List[RawQuestion]) -> tuple[List[dict], dict]:
    result = []
    skipped = {
        "objective_options_lt2": 0,
        "objective_no_answer": 0,
    }
    seq = 1
    for raw in raw_questions:
        qtype = raw.qtype
        stem = raw.stem.strip()
        if raw.topic:
            stem = f"{raw.topic}｜{stem}"

        option_tails: List[str] = []
        options = []
        for key, value in raw.options:
            if not value.strip():
                continue
            opt_text, tail = split_option_text_and_tail(value)
            if opt_text:
                options.append({"key": key, "text": opt_text})
            if tail:
                option_tails.append(tail)

        answer_text = raw.answer_text.strip()
        if not answer_text and option_tails:
            answer_text = " ".join(option_tails).strip()

        # infer type when missing/unclear
        if qtype not in {"single", "multiple", "judge", "short"}:
            qtype = "single"

        if qtype in {"single", "multiple", "judge"}:
            # Some lines are like: "C A.xxx B.xxx C.xxx D.xxx" (answer + options merged).
            stitched = re.match(r"^\s*([A-H]{1,4})\s+(.+)$", answer_text, flags=re.I)
            if len(options) < 2 and stitched:
                inline_opts = split_inline_options(stitched.group(2))
                if len(inline_opts) >= 2:
                    options = [{"key": k, "text": v.strip()} for k, v in inline_opts if v.strip()]
                    answer_text = stitched.group(1).upper()

            ans = parse_objective_answer(answer_text, qtype)
            if qtype == "single" and len(ans) > 1:
                qtype = "multiple"
            if qtype == "judge":
                if not options:
                    options = [
                        {"key": "A", "text": "对 / 正确"},
                        {"key": "B", "text": "错 / 错误"},
                    ]
            if qtype in {"single", "multiple"} and len(options) < 2:
                stem, inline_opts = split_stem_and_options(stem)
                if len(inline_opts) >= 2:
                    options = [{"key": k, "text": v.strip()} for k, v in inline_opts if v.strip()]
            if qtype in {"single", "multiple"} and len(options) < 2:
                # cannot safely grade objective question without options
                skipped["objective_options_lt2"] += 1
                continue
            if not ans and qtype != "short":
                # no explicit answer, skip objective question
                skipped["objective_no_answer"] += 1
                continue
            result.append(
                {
                    "id": f"seed_q_{seq}",
                    "number": seq,
                    "chapter": raw.chapter,
                    "type": qtype,
                    "stem": stem,
                    "options": options,
                    "answer": ans,
                    "answerText": answer_text if qtype == "short" else "",
                    "explanation": raw.explanation.strip(),
                    "sourceFile": raw.source_file,
                }
            )
            seq += 1
            continue

        # subjective question
        subjective_answer = answer_text or raw.explanation.strip()
        result.append(
            {
                "id": f"seed_q_{seq}",
                "number": seq,
                "chapter": raw.chapter,
                "type": "short",
                "stem": stem,
                "options": [],
                "answer": [],
                "answerText": subjective_answer,
                "explanation": raw.explanation.strip(),
                "sourceFile": raw.source_file,
            }
        )
        seq += 1
    return result, skipped


def build() -> None:
    raw: List[RawQuestion] = []
    file_stats = []
    for path in DOCX_FILES:
        parsed = parse_file(path)
        raw.extend(parsed)
        file_stats.append((Path(path).name, len(parsed)))

    normalized, skipped = normalize_questions(raw)
    chapter_counts = {}
    type_counts = {"single": 0, "multiple": 0, "judge": 0, "short": 0}
    for q in normalized:
        chapter_counts[q["chapter"]] = chapter_counts.get(q["chapter"], 0) + 1
        qtype = q["type"]
        type_counts[qtype] = type_counts.get(qtype, 0) + 1

    payload = {
        "version": SEED_VERSION,
        "total": len(normalized),
        "typeCounts": type_counts,
        "chapterCounts": chapter_counts,
        "questions": normalized,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"总题数: {payload['total']}",
        f"题型统计: {payload['typeCounts']}",
        "",
        "章节统计:",
    ]
    for chapter, count in sorted(chapter_counts.items(), key=lambda x: x[0]):
        lines.append(f"- {chapter}: {count}")
    OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")

    print(f"Wrote: {OUT_JSON}")
    print(f"Wrote: {OUT_REPORT}")
    print(f"Total: {payload['total']}")
    print(f"Types: {payload['typeCounts']}")
    print(f"Skipped: {skipped}")
    print("Raw by file:")
    for name, count in file_stats:
        print(f"- {name}: {count}")


if __name__ == "__main__":
    build()
