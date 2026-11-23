"""Application-wide constants, thresholds, and health equivalence metrics."""

# Berkeley Earth equivalent: 22 µg/m³ of PM2.5 inhaled roughly equals 1 cigarette/day
BERKELEY_EARTH_PM25_PER_CIGARETTE: float = 22.0

# General AQI advisory thresholds
SAFE_AQI_THRESHOLD: float = 100.0
CAUTION_AQI_THRESHOLD: float = 150.0
UNHEALTHY_AQI_THRESHOLD: float = 200.0

# Diurnal routine schedule windows (hours in 24h format)
MORNING_WINDOW_START: int = 5
MORNING_WINDOW_END: int = 10
VENTILATION_WINDOW_START: int = 11
VENTILATION_WINDOW_END: int = 16
AFTERNOON_PLAY_WINDOW_START: int = 14
AFTERNOON_PLAY_WINDOW_END: int = 18
EVENING_INVERSION_WINDOW_START: int = 17
EVENING_INVERSION_WINDOW_END: int = 22
NIGHT_WINDOW_START: int = 22
NIGHT_WINDOW_END: int = 6
