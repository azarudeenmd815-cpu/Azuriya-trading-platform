package broker

import (
	"azuriya/backend/internal/domain"
	"fmt"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
)

func minuteClock(value string, end bool) (int, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 || len(parts[0]) != 2 || len(parts[1]) != 2 {
		return 0, domain.Err("INVALID_SESSION", "Time must use HH:MM")
	}
	h, e := strconv.Atoi(parts[0])
	m, f := strconv.Atoi(parts[1])
	if e != nil || f != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		if end && value == "24:00" {
			return 1440, nil
		}
		return 0, domain.Err("INVALID_SESSION", "Time must be a valid HH:MM")
	}
	return h*60 + m, nil
}
func validSession(status string) bool {
	return status == "OPEN" || status == "CLOSE_ONLY" || status == "CLOSED"
}

type weekWindow struct {
	start, end int
	status     string
}

func sessionWindows(p domain.SessionPolicy) ([]weekWindow, error) {
	if _, err := time.LoadLocation(p.Timezone); err != nil {
		return nil, domain.Err("INVALID_TIMEZONE", "Use a valid IANA timezone")
	}
	if !validSession(p.DefaultStatus) {
		return nil, domain.Err("INVALID_SESSION", "Invalid default session status")
	}
	if len(p.Windows) > 100 {
		return nil, domain.Err("INVALID_SESSION", "At most 100 weekly windows are allowed")
	}
	list := []weekWindow{}
	occupied := map[int]bool{}
	for _, w := range p.Windows {
		if w.Day < 0 || w.Day > 6 || !validSession(w.Status) {
			return nil, domain.Err("INVALID_SESSION", "Window day or status is invalid")
		}
		start, err := minuteClock(w.Start, false)
		if err != nil {
			return nil, err
		}
		end, err := minuteClock(w.End, true)
		if err != nil {
			return nil, err
		}
		if end <= start {
			end += 1440
		}
		absolute := w.Day*1440 + start
		finish := w.Day*1440 + end
		for n := absolute; n < finish; n++ {
			k := n % (7 * 1440)
			if occupied[k] {
				return nil, domain.Err("INVALID_SESSION", "Weekly session windows overlap")
			}
			occupied[k] = true
		}
		list = append(list, weekWindow{absolute, finish, w.Status})
	}
	return list, nil
}
func SessionStatus(p domain.SessionPolicy, now time.Time) (string, error) {
	windows, err := sessionWindows(p)
	if err != nil {
		return "", err
	}
	location, _ := time.LoadLocation(p.Timezone)
	local := now.In(location)
	minute := int(local.Weekday())*1440 + local.Hour()*60 + local.Minute()
	for _, w := range windows {
		if (minute >= w.start && minute < w.end) || (minute+7*1440 >= w.start && minute+7*1440 < w.end) {
			return w.status, nil
		}
	}
	return p.DefaultStatus, nil
}
func RolloverAt(p domain.SwapPolicy, date time.Time) (time.Time, error) {
	location, err := time.LoadLocation(p.Timezone)
	if err != nil {
		return time.Time{}, domain.Err("INVALID_TIMEZONE", "Use a valid IANA timezone")
	}
	clock, err := minuteClock(p.RolloverTime, false)
	if err != nil {
		return time.Time{}, err
	}
	local := date.In(location)
	at := time.Date(local.Year(), local.Month(), local.Day(), clock/60, clock%60, 0, 0, location)
	return at, nil
}
func SessionAllows(status string, closing bool) error {
	if status == "CLOSED" {
		return domain.Err("SESSION_CLOSED", "The trading session is closed")
	}
	if status == "CLOSE_ONLY" && !closing {
		return domain.Err("SESSION_CLOSE_ONLY", "The trading session permits exposure reduction only")
	}
	if !validSession(status) {
		return domain.Err("INVALID_SESSION", fmt.Sprintf("Unsupported session state %s", status))
	}
	return nil
}
