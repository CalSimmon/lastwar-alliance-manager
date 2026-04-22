// Standalone OCR parser test — no CGO required.
// Tests both parsePowerRankingsText and parseVSPointsText from main.go.
package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type Record struct {
	MemberName string
	Power      int64
}

func parsePowerRankingsText(text string) []Record {
	var records []Record

	lines := strings.Split(text, "\n")

	// Number pattern: matches plain 7+ digits OR comma-formatted (48,898,988)
	numPat := `([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{7,})`

	// Pattern 1: optional alliance rank badge (R4/R3) prefix, name, then number
	rankPattern := regexp.MustCompile(`(?:R[0-9]\s+)?([A-Za-z][A-Za-z0-9_\s]+?)\s+` + numPat)

	// Pattern 2: leading rank digit(s) + name + optional alliance tag + number
	// "1 Malata90 [RSRP] Reset Reapers 48,898,988"
	rankPrefixPattern := regexp.MustCompile(`^[0-9]{1,3}\s+([A-Za-z][A-Za-z0-9_\s]+?)\s+(?:\[[^\]]*\][^0-9]*)?\s*` + numPat)

	// Pattern 3: name then alliance tag then number
	// "Gone Quixote [RSRP] Reset Reapers 22,222,922"
	alliancePattern := regexp.MustCompile(`([A-Za-z][A-Za-z0-9_\s]+?)\s+\[[^\]]*\][^0-9]*` + numPat)

	// Pattern 4: simple name + number
	simplePattern := regexp.MustCompile(`([A-Za-z][A-Za-z0-9_\s]+?)\s+` + numPat)

	// Pattern 5: flexible (allows letters in number for heavy OCR errors)
	flexiblePattern := regexp.MustCompile(`(?:[A-Z]{1,3}\s+)?(?:\d+\)?\s+)?([A-Za-z][A-Za-z0-9_\s]+?)\s+([A-Za-z0-9]{7,})`)

	seenNames := make(map[string]bool)
	whitespaceRe := regexp.MustCompile(`\s+`)
	nonDigitRe := regexp.MustCompile(`[^0-9]`)
	digitRe := regexp.MustCompile(`[0-9]`)
	skipLineRe := regexp.MustCompile(`^[0-9]{1,3}\.?$`)
	dayRe := regexp.MustCompile(`^(mon|tues|wed|thur|fri|sat|sun)\.?$`)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) < 5 || skipLineRe.MatchString(line) {
			continue
		}

		lowerLine := strings.ToLower(line)
		if strings.Contains(lowerLine, "ranking") ||
			strings.Contains(lowerLine, "commander") ||
			strings.Contains(lowerLine, "power") ||
			strings.Contains(lowerLine, "kills") ||
			strings.Contains(lowerLine, "donation") ||
			strings.Contains(lowerLine, "daily rank") ||
			strings.Contains(lowerLine, "weekly rank") ||
			strings.Contains(lowerLine, "your alliance") ||
			strings.Contains(lowerLine, "points") ||
			dayRe.MatchString(lowerLine) {
			continue
		}

		var matches []string
		matches = rankPrefixPattern.FindStringSubmatch(line)
		if len(matches) == 0 {
			matches = alliancePattern.FindStringSubmatch(line)
		}
		if len(matches) == 0 {
			matches = rankPattern.FindStringSubmatch(line)
		}
		if len(matches) == 0 {
			matches = simplePattern.FindStringSubmatch(line)
		}
		if len(matches) == 0 {
			matches = flexiblePattern.FindStringSubmatch(line)
		}

		if len(matches) < 3 {
			fmt.Printf("  [no match] %q\n", line)
			continue
		}

		// For flexible pattern (only one that allows letters in number),
		// require at least 6 raw digits to avoid false positives from garbled text.
		rawDigits := len(digitRe.FindAllString(matches[2], -1))
		if rawDigits < 6 && matches[0] == flexiblePattern.FindString(line) {
			fmt.Printf("  [skip-flex low digits] %q raw=%q digits=%d\n", line, matches[2], rawDigits)
			continue
		}

		name := strings.TrimSpace(matches[1])
		name = whitespaceRe.ReplaceAllString(name, " ")

		powerStr := strings.ReplaceAll(matches[2], ",", "")
		powerStr = strings.ReplaceAll(powerStr, " ", "")
		powerStr = strings.ReplaceAll(powerStr, ".", "")
		powerStr = strings.ReplaceAll(powerStr, "O", "0")
		powerStr = strings.ReplaceAll(powerStr, "o", "0")
		powerStr = strings.ReplaceAll(powerStr, "s", "6")
		powerStr = strings.ReplaceAll(powerStr, "S", "5")
		powerStr = strings.ReplaceAll(powerStr, "l", "1")
		powerStr = strings.ReplaceAll(powerStr, "I", "1")
		powerStr = strings.ReplaceAll(powerStr, "Z", "2")
		powerStr = strings.ReplaceAll(powerStr, "B", "8")
		powerStr = strings.ReplaceAll(powerStr, "e", "6")
		powerStr = strings.ReplaceAll(powerStr, "g", "9")
		powerStr = strings.ReplaceAll(powerStr, "G", "6")
		powerStr = nonDigitRe.ReplaceAllString(powerStr, "")

		power, err := strconv.ParseInt(powerStr, 10, 64)
		if err != nil || power < 1000000 || power > 9999999999 || len(name) < 4 || len(name) > 30 || seenNames[name] {
			if err != nil {
				fmt.Printf("  [bad power] %q -> powerStr=%q err=%v\n", line, powerStr, err)
			}
			continue
		}

		records = append(records, Record{MemberName: name, Power: power})
		seenNames[name] = true
	}

	return records
}

func runTest(label, text string, expected []Record) {
	fmt.Printf("\n=== %s ===\n", label)
	got := parsePowerRankingsText(text)
	ok := true
	if len(got) != len(expected) {
		fmt.Printf("FAIL: got %d records, want %d\n", len(got), len(expected))
		ok = false
	}
	for i, r := range got {
		if i < len(expected) && (r.MemberName != expected[i].MemberName || r.Power != expected[i].Power) {
			fmt.Printf("FAIL row %d: got {%q %d} want {%q %d}\n", i+1, r.MemberName, r.Power, expected[i].MemberName, expected[i].Power)
			ok = false
		} else {
			fmt.Printf("  OK  row %d: %q -> %d\n", i+1, r.MemberName, r.Power)
		}
	}
	if ok && len(got) == len(expected) {
		fmt.Println("PASS")
	}
}

type VSRecord struct {
	MemberName string
	Points     int64
}

func parseVSPointsText(text string) []VSRecord {
	var records []VSRecord

	lines := strings.Split(text, "\n")

	numPat := `([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{6,})`
	rankPrefixPattern := regexp.MustCompile(`^[0-9]{1,3}\s+([A-Za-z][A-Za-z0-9_\s]+?)\s+(?:\[[^\]]*\][^0-9]*)?\s*` + numPat)
	alliancePattern := regexp.MustCompile(`([A-Za-z][A-Za-z0-9_\s]+?)\s+\[[^\]]*\][^0-9]*` + numPat)
	rankPattern := regexp.MustCompile(`(?:R[0-9]\s+)?([A-Za-z][A-Za-z0-9_\s]*?)\s+` + numPat)
	simplePattern := regexp.MustCompile(`([A-Za-z][A-Za-z0-9_\s]+?)\s+` + numPat)

	whitespaceRe := regexp.MustCompile(`\s+`)
	nonDigitRe := regexp.MustCompile(`[^0-9]`)
	skipLineRe := regexp.MustCompile(`^[0-9]{1,3}\.?$`)
	dayRe := regexp.MustCompile(`^(mon|tues|wed|thur|fri|sat|sun)\.?$`)

	seenNames := make(map[string]bool)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || len(line) < 5 || skipLineRe.MatchString(line) {
			continue
		}
		lowerLine := strings.ToLower(line)
		if strings.Contains(lowerLine, "ranking") || strings.Contains(lowerLine, "commander") ||
			strings.Contains(lowerLine, "points") || strings.Contains(lowerLine, "daily rank") ||
			strings.Contains(lowerLine, "weekly rank") || strings.Contains(lowerLine, "your alliance") ||
			dayRe.MatchString(lowerLine) {
			continue
		}

		var matches []string
		matches = rankPrefixPattern.FindStringSubmatch(line)
		if len(matches) == 0 {
			matches = alliancePattern.FindStringSubmatch(line)
		}
		if len(matches) == 0 {
			matches = rankPattern.FindStringSubmatch(line)
		}
		if len(matches) == 0 {
			matches = simplePattern.FindStringSubmatch(line)
		}

		if len(matches) < 3 {
			fmt.Printf("  [no match] %q\n", line)
			continue
		}

		name := whitespaceRe.ReplaceAllString(strings.TrimSpace(matches[1]), " ")
		pointsStr := nonDigitRe.ReplaceAllString(strings.ReplaceAll(matches[2], ",", ""), "")
		points, err := strconv.ParseInt(pointsStr, 10, 64)
		if err != nil || points < 10000 || points > 999999999 || len(name) < 4 || len(name) > 30 || seenNames[name] {
			continue
		}
		records = append(records, VSRecord{MemberName: name, Points: points})
		seenNames[name] = true
	}
	return records
}

func runVSTest(label, text string, expected []VSRecord) {
	fmt.Printf("\n=== %s ===\n", label)
	got := parseVSPointsText(text)
	ok := true
	if len(got) != len(expected) {
		fmt.Printf("FAIL: got %d records, want %d\n", len(got), len(expected))
		ok = false
	}
	for i, r := range got {
		if i < len(expected) && (r.MemberName != expected[i].MemberName || r.Points != expected[i].Points) {
			fmt.Printf("FAIL row %d: got {%q %d} want {%q %d}\n", i+1, r.MemberName, r.Points, expected[i].MemberName, expected[i].Points)
			ok = false
		} else {
			fmt.Printf("  OK  row %d: %q -> %d\n", i+1, r.MemberName, r.Points)
		}
	}
	if ok && len(got) == len(expected) {
		fmt.Println("PASS")
	}
}

func main() {
	// --- Test 1: Old power ranking format (no commas, R4/R5 badges) ---
	runTest("Power ranking (no commas, R4 badges)",
		`R4 Gary6126 77421000
R4 ileesu 66715876
R3 DYNOSUR 63785308
R3 MTee689 62293086
R5 Nutty Tx 61926102
R4 Fighter Davo 58154185`,
		[]Record{
			{"Gary6126", 77421000},
			{"ileesu", 66715876},
			{"DYNOSUR", 63785308},
			{"MTee689", 62293086},
			{"Nutty Tx", 61926102},
			{"Fighter Davo", 58154185},
		},
	)

	// --- Test 2: Daily ranking Monday (comma-formatted, alliance tags inline) ---
	runTest("Daily ranking Monday (comma numbers + alliance tags)",
		`RANKING
Daily Rank Weekly Rank
Mon. Tues. Wed. Thur. Fri. Sat.
Ranking Commander Points
1 Malata90 [RSRP] Reset Reapers 48,898,988
2 MTee689 [RSRP] Reset Reapers 33,898,338
3 Gone Quixote [RSRP] Reset Reapers 22,222,922
4 Brian M100 [RSRP] Reset Reapers 21,121,200
5 Sherrif Seige [RSRP] Reset Reapers 19,291,992
6 PhenexX [RSRP] Reset Reapers 19,134,266
7 alana85 [RSRP] Reset Reapers 17,072,920
26 Orlzie [RSRP]Reset Reapers 7,098,314`,
		[]Record{
			{"Malata90", 48898988},
			{"MTee689", 33898338},
			{"Gone Quixote", 22222922},
			{"Brian M100", 21121200},
			{"Sherrif Seige", 19291992},
			{"PhenexX", 19134266},
			{"alana85", 17072920},
			{"Orlzie", 7098314},
		},
	)

	// --- Test 3: Daily ranking Tuesday ---
	runTest("Daily ranking Tuesday",
		`RANKING
Daily Rank Weekly Rank
Mon. Tues. Wed. Thur. Fri. Sat.
Ranking Commander Points
1 Rohan 84 [RSRP] Reset Reapers 16,121,560
2 WoodWould [RSRP] Reset Reapers 11,666,700
3 Rynoo512 [RSRP] Reset Reapers 10,489,250
4 Lecithin274 [RSRP] Reset Reapers 9,996,750
5 Malata90 [RSRP] Reset Reapers 9,927,625
6 Fighter Davo [RSRP] Reset Reapers 9,369,070
7 AmishKTJ [RSRP] Reset Reapers 8,801,750
14 Orlzie [RSRP]Reset Reapers 7,411,550`,
		[]Record{
			{"Rohan 84", 16121560},
			{"WoodWould", 11666700},
			{"Rynoo512", 10489250},
			{"Lecithin274", 9996750},
			{"Malata90", 9927625},
			{"Fighter Davo", 9369070},
			{"AmishKTJ", 8801750},
			{"Orlzie", 7411550},
		},
	)

	// --- Test 4: Garbled OCR (from actual server log) ---
	runTest("Garbled OCR (real server output)",
		`BS BD & ems e27es208
B 25) Nutty Tx s1926102
En) Bt Fistter nave sasuias`,
		[]Record{
			{"Nutty Tx", 61926102},
		},
	)

	// --- VS Points Tests ---
	runVSTest("VS Daily ranking Monday (comma numbers + alliance tags)",
		`RANKING
Daily Rank Weekly Rank
Mon. Tues. Wed. Thur. Fri. Sat.
Ranking Commander Points
1 Malata90 [RSRP] Reset Reapers 48,898,988
2 MTee689 [RSRP] Reset Reapers 33,898,338
3 Gone Quixote [RSRP] Reset Reapers 22,222,922
4 Brian M100 [RSRP] Reset Reapers 21,121,200
5 Sherrif Seige [RSRP] Reset Reapers 19,291,992
6 PhenexX [RSRP] Reset Reapers 19,134,266
7 alana85 [RSRP] Reset Reapers 17,072,920
26 Orlzie [RSRP]Reset Reapers 7,098,314`,
		[]VSRecord{
			{"Malata90", 48898988},
			{"MTee689", 33898338},
			{"Gone Quixote", 22222922},
			{"Brian M100", 21121200},
			{"Sherrif Seige", 19291992},
			{"PhenexX", 19134266},
			{"alana85", 17072920},
			{"Orlzie", 7098314},
		},
	)

	runVSTest("VS Daily ranking Tuesday (comma numbers + alliance tags)",
		`RANKING
Daily Rank Weekly Rank
Mon. Tues. Wed. Thur. Fri. Sat.
Ranking Commander Points
1 Rohan 84 [RSRP] Reset Reapers 16,121,560
2 WoodWould [RSRP] Reset Reapers 11,666,700
3 Rynoo512 [RSRP] Reset Reapers 10,489,250
4 Lecithin274 [RSRP] Reset Reapers 9,996,750
5 Malata90 [RSRP] Reset Reapers 9,927,625
6 Fighter Davo [RSRP] Reset Reapers 9,369,070
7 AmishKTJ [RSRP] Reset Reapers 8,801,750
14 Orlzie [RSRP]Reset Reapers 7,411,550`,
		[]VSRecord{
			{"Rohan 84", 16121560},
			{"WoodWould", 11666700},
			{"Rynoo512", 10489250},
			{"Lecithin274", 9996750},
			{"Malata90", 9927625},
			{"Fighter Davo", 9369070},
			{"AmishKTJ", 8801750},
			{"Orlzie", 7411550},
		},
	)
}
