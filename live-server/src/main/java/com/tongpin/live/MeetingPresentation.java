package com.tongpin.live;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

/** State for one presentation, accessed under the same lock as meeting membership. */
final class MeetingPresentation {
    record Segment(String id, String title, String presenterId, String presenter, int minutes) {}
    record Question(String id, String segmentId, String author, String content, long elapsedMs, boolean answered) {}

    private static final List<String> PACE = List.of("following", "slower", "working");
    private final List<Segment> agenda;
    private final Set<String> ready = new HashSet<>();
    private final Set<String> skipped = new HashSet<>();
    private final Map<String, String> feedback = new HashMap<>();
    private final List<Question> questions = new ArrayList<>();
    private int cursor;
    private Segment current;
    private Segment invited;
    private long startedAt;
    private long deadline;
    private boolean finished;
    long emptySince;

    MeetingPresentation(List<Segment> agenda) { this.agenda = List.copyOf(agenda); }

    boolean editable() { return cursor == 0 && !finished; }
    Segment invitation() { return invited; }

    private Segment next() { return invited != null ? invited : cursor < agenda.size() ? agenda.get(cursor) : null; }

    void ready(String actor, String segmentId) {
        Segment next = next();
        if (finished || next == null || !next.id().equals(segmentId)) throw changed();
        if (!next.presenterId().equals(actor)) throw new ResponseStatusException(FORBIDDEN, "只有下一位汇报人可以确认准备");
        ready.add(segmentId);
    }

    void invite(String segmentId, Predicate<String> online) {
        if (finished || invited != null || next() == null || !next().id().equals(segmentId)) throw changed();
        offerNext(online);
    }

    void skip(String segmentId, Predicate<String> online) {
        if (invited == null || !invited.id().equals(segmentId)) throw changed();
        skipped.add(invited.id());
        invited = null;
        offerNext(online);
    }

    private void offerNext(Predicate<String> online) {
        while (cursor < agenda.size()) {
            Segment candidate = agenda.get(cursor++);
            if (online.test(candidate.presenterId())) {
                invited = candidate;
                return;
            }
            skipped.add(candidate.id());
        }
    }

    void accept(String actor, String segmentId, long now) {
        if (invited == null || !invited.id().equals(segmentId)) throw changed();
        if (!invited.presenterId().equals(actor)) throw new ResponseStatusException(FORBIDDEN, "只有获邀成员可以接手");
        current = invited;
        invited = null;
        startedAt = now;
        deadline = now + current.minutes() * 60_000L;
        feedback.clear();
    }

    void finish() {
        if (finished || next() != null) throw changed();
        finished = true;
        current = null;
        feedback.clear();
    }

    void pace(String actor, String segmentId, String value) {
        requireCurrent(segmentId);
        if (current.presenterId().equals(actor)) throw new ResponseStatusException(FORBIDDEN, "汇报人可查看节奏反馈");
        if (!PACE.contains(value)) throw new ResponseStatusException(BAD_REQUEST, "请选择节奏反馈");
        feedback.put(actor, value);
    }

    void ask(String id, String segmentId, String author, String content, long sinceMeetingStart) {
        requireCurrent(segmentId);
        if (questions.stream().anyMatch(question -> question.id().equals(id))) return;
        if (questions.size() >= 50) throw new ResponseStatusException(CONFLICT, "本场会议已收录 50 个问题");
        questions.add(new Question(id, segmentId, author, content, Math.max(0, sinceMeetingStart), false));
    }

    void answer(String id) {
        for (int i = 0; i < questions.size(); i++) {
            Question question = questions.get(i);
            if (!question.id().equals(id)) continue;
            questions.set(i, new Question(question.id(), question.segmentId(), question.author(), question.content(), question.elapsedMs(), true));
            return;
        }
        throw new ResponseStatusException(NOT_FOUND, "未找到该问题");
    }

    Map<String, Object> snapshot(String viewer, boolean host, long now) {
        var state = new LinkedHashMap<String, Object>();
        state.put("type", "PRESENTATION_STATE");
        state.put("agenda", agenda);
        state.put("currentId", current == null ? "" : current.id());
        state.put("invitedId", invited == null ? "" : invited.id());
        state.put("nextId", next() == null ? "" : next().id());
        state.put("readyIds", ready);
        state.put("skippedIds", skipped);
        state.put("editable", editable());
        state.put("finished", finished);
        state.put("startedAt", startedAt);
        state.put("deadline", current == null ? 0 : deadline);
        state.put("serverNow", now);
        state.put("ownPace", feedback.getOrDefault(viewer, ""));
        state.put("questions", questions);
        if (host || (current != null && current.presenterId().equals(viewer))) {
            var counts = new LinkedHashMap<String, Integer>();
            PACE.forEach(key -> counts.put(key, 0));
            feedback.values().forEach(key -> counts.merge(key, 1, Integer::sum));
            state.put("paceCounts", counts);
        }
        return state;
    }

    private void requireCurrent(String id) {
        if (current == null || !current.id().equals(id)) throw changed();
    }

    private ResponseStatusException changed() {
        return new ResponseStatusException(CONFLICT, "议程已更新，请查看当前环节");
    }
}
