package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// Konfigurasi simulator
const (
	numSatellites = 3
	minInterval   = 3 // detik
	maxInterval   = 5 // detik
	maxLogLines   = 500
	logFileName   = "../logs/telemetri.log"
	jsonFileName  = "../logs/telemetri.json"
)

// DataPoint mewakili satu kiriman data telemetri dari satelit
type DataPoint struct {
	Timestamp   string  `json:"timestamp"`
	SatelliteID int     `json:"satellite_id"`
	Temperature float64 `json:"temperature"`     // Celsius
	Power       float64 `json:"power"`           // Watt
	Altitude    float64 `json:"altitude"`        // km
	Signal      float64 `json:"signal_strength"` // dBm
}

// rotatingWriter menulis ke file dengan rotasi berdasarkan jumlah baris
type rotatingWriter struct {
	mu       sync.Mutex
	file     *os.File
	lines    int
	maxLines int
}

func newRotatingWriter(filename string, maxLines int) (*rotatingWriter, error) {
	f, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	// Hitung baris yang sudah ada
	content, _ := os.ReadFile(filename)
	lines := 0
	for _, b := range content {
		if b == '\n' {
			lines++
		}
	}
	return &rotatingWriter{file: f, lines: lines, maxLines: maxLines}, nil
}

func (w *rotatingWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.lines >= w.maxLines {
		// Rotasi: hapus file lama dan mulai baru
		w.file.Close()
		if err := os.Remove(logFileName); err != nil {
			return 0, err
		}
		f, err := os.OpenFile(logFileName, os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return 0, err
		}
		w.file = f
		w.lines = 0
	}

	n, err := w.file.Write(b)
	w.lines++
	return n, err
}

func (w *rotatingWriter) Close() error {
	return w.file.Close()
}

func main() {
	// Siapkan direktori log
	os.MkdirAll("../logs", 0755)

	// Inisialisasi rotating writer untuk file log
	rw, err := newRotatingWriter(logFileName, maxLogLines)
	if err != nil {
		log.Fatal(err)
	}
	defer rw.Close()

	multiLog := log.New(rw, "", log.LstdFlags)

	// Siapkan slice untuk menyimpan data terbaru (sebagai JSON nanti)
	var dataMu sync.Mutex
	var latestData []DataPoint

	// Channel untuk sinyal shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	done := make(chan struct{})

	// WaitGroup untuk goroutine satelit
	var wg sync.WaitGroup

	fmt.Println("IoT Simulator started. Press Ctrl+C to stop.")

	// Jalankan goroutine untuk setiap satelit
	for satID := 1; satID <= numSatellites; satID++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(id)))

			for {
				select {
				case <-done:
					return
				default:
					// Buat data acak realistis
					dp := DataPoint{
						Timestamp:   time.Now().UTC().Format(time.RFC3339),
						SatelliteID: id,
						Temperature: 20.0 + rng.Float64()*15.0,   // 20-35 °C
						Power:       50.0 + rng.Float64()*150.0,  // 50-200 W
						Altitude:    400.0 + rng.Float64()*100.0, // 400-500 km
						Signal:      -100.0 + rng.Float64()*30.0, // -100 hingga -70 dBm
					}

					// Log ke file
					multiLog.Printf("SAT%d | Temp=%.2f°C Power=%.2fW Alt=%.2fkm Signal=%.2fdBm",
						dp.SatelliteID, dp.Temperature, dp.Power, dp.Altitude, dp.Signal)

					// Simpan di memori untuk JSON
					dataMu.Lock()
					latestData = append(latestData, dp)
					// Pertahankan hanya 50 data terbaru agar tidak boros RAM
					if len(latestData) > 50 {
						latestData = latestData[1:]
					}
					dataMu.Unlock()

					// Tulis data terbaru ke file JSON (overwrite)
					func() {
						dataMu.Lock()
						defer dataMu.Unlock()
						jsonBytes, err := json.MarshalIndent(latestData, "", "  ")
						if err == nil {
							os.WriteFile(jsonFileName, jsonBytes, 0644)
						}
					}()

					// Interval acak antara 3-5 detik
					sleepTime := time.Duration(minInterval+rng.Intn(maxInterval-minInterval+1)) * time.Second
					select {
					case <-done:
						return
					case <-time.After(sleepTime):
					}
				}
			}
		}(satID)
	}

	// Tunggu sinyal shutdown
	<-sigCh
	fmt.Println("\nShutting down simulator...")
	close(done)
	wg.Wait()
	fmt.Println("All satellites stopped.")
}
