from shared.env import mask, missing_keys


def test_missing_keys_reports_absent_and_blank():
    env = {"A": "set", "B": "  ", "C": ""}
    assert missing_keys(["A", "B", "C", "D"], env) == ["B", "C", "D"]


def test_missing_keys_empty_when_all_present():
    assert missing_keys(["A"], {"A": "x"}) == []


def test_mask_hides_all_but_last_chars():
    assert mask("sk-ant-123456") == "*********3456"


def test_mask_short_value_fully_hidden():
    assert mask("abc") == "***"
