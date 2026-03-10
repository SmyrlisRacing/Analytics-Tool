import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { sessionsApi, weatherApi, Session, Result, Lap, SectorTime, WeatherData } from '../api';

function SessionDetails() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [sectors, setSectors] = useState<SectorTime[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [activeTab, setActiveTab] = useState<'results' | 'analysis' | 'comparison'>('results');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [compareTeamId, setCompareTeamId] = useState<string | null>(null);
  const [expandedLap, setExpandedLap] = useState<number | null>(null);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      try {
        const [sessionRes, resultsRes, lapsRes, sectorsRes, weatherRes] = await Promise.all([
          sessionsApi.getById(id),
          sessionsApi.getResults(id),
          sessionsApi.getLaps(id),
          sessionsApi.getSectors(id),
          weatherApi.getWeather(id),
        ]);

        setSession(sessionRes.data);
        setResults(resultsRes.data);
        setLaps(lapsRes.data);
        setSectors(sectorsRes.data);
        setWeather(weatherRes.data);
      } catch (err) {
        setError('Failed to load session details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const formatTime = (seconds: number | undefined | null) => {
    if (!seconds || seconds === 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins}:${secs.padStart(6, '0')}`;
  };

  if (loading) return <div className="loading">Loading session details...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!session) return <div className="error">Session not found</div>;

  return (
    <div>
      <div className="card">
        <h2>{session.name}</h2>
        <div>
          <span className={`badge ${session.type.toLowerCase()}`}>
            {session.type}
          </span>
          <span style={{ marginLeft: '1rem', color: '#888' }}>
            {new Date(session.date).toLocaleDateString('de-DE')}
          </span>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          Results ({results.length})
        </button>
        <button
          className={`tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          Team Analysis
        </button>
        <button
          className={`tab ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
          style={{ opacity: compareTeamId ? 1 : 0.5 }}
        >
          Vergleich {compareTeamId ? '⚖' : ''}
        </button>
      </div>

      {activeTab === 'results' && (
        <div className="card">
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label>Class Filter</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              style={{ padding: '0.5rem' }}
            >
              <option value="all">All</option>
              {Array.from(new Set(results.map((r) => r.vehicle?.vehicleClass).filter(Boolean) as string[]))
                .sort((a, b) => a.localeCompare(b, 'de'))
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pos</th>
                <th>#</th>
                <th>Team</th>
                <th>Drivers</th>
                <th>Vehicle</th>
                <th>Laps</th>
                <th>Best Lap</th>
                {session.type === 'RACE' && <th>Pit Stops</th>}
                {session.type === 'RACE' && <th>Gap</th>}
              </tr>
            </thead>
            <tbody>
              {results
                .filter((result) => classFilter === 'all' || result.vehicle?.vehicleClass === classFilter)
                .map((result) => (
                <tr 
                  key={result.id}
                  onClick={() => {
                    setSelectedTeam(result.team.id);
                    setActiveTab('analysis');
                  }}
                  style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = ''}
                >
                  <td className={`position-${result.position}`}>
                    {result.position ?? result.status ?? '-'}
                  </td>
                  <td>{result.startNumber}</td>
                  <td style={{ fontWeight: 'bold' }}>{result.team.name}</td>
                  <td>
                    {(() => {
                      const drivers = laps
                        .filter((lap) => lap.startNumber === result.startNumber)
                        .map((lap) => lap.driver)
                        .filter(Boolean)
                        .map((driver) => `${driver.firstName} ${driver.lastName}`);
                      const uniqueDrivers = Array.from(new Set(drivers));

                      if (uniqueDrivers.length > 0) {
                        return uniqueDrivers.join(', ');
                      }

                      return `${result.driver.firstName} ${result.driver.lastName}`;
                    })()}
                  </td>
                  <td>
                    {result.vehicle.model}
                    <br />
                    <small style={{ color: '#888' }}>
                      {result.vehicle.vehicleClass || 'N/A'}
                    </small>
                  </td>
                  <td>{result.totalLaps || '-'}</td>
                  <td>{formatTime(result.bestLapTime)}</td>
                  {session.type === 'RACE' && <td>{result.pitStopCount ?? 0}</td>}
                  {session.type === 'RACE' && <td>{result.gap || '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#888' }}>
            💡 Click on a team row to see detailed lap analysis →
          </p>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="card">
          {selectedTeam ? (
            <TeamLapAnalysis
              teamId={selectedTeam}
              laps={laps}
              sectors={sectors}
              results={results}
              formatTime={formatTime}
              expandedLap={expandedLap}
              setExpandedLap={setExpandedLap}
              sessionType={session.type}
              weather={weather}
              onCompare={() => {
                setCompareTeamId(selectedTeam);
                setActiveTab('comparison');
              }}
            />
          ) : (
            <p style={{ textAlign: 'center', color: '#888' }}>
              Select a team from the Results tab to view lap analysis
            </p>
          )}
        </div>
      )}

      {activeTab === 'comparison' && (
        <div className="card">
          {compareTeamId ? (
            <TeamComparison
              teamIdA={compareTeamId}
              results={results}
              laps={laps}
              sectors={sectors}
              formatTime={formatTime}
              weather={weather}
              sessionType={session.type}
            />
          ) : (
            <p style={{ textAlign: 'center', color: '#888' }}>
              Klicke auf "⚖ Vergleich" in einem Team-Eintrag um den Vergleich zu starten
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Team Lap Analysis Component
interface TeamLapAnalysisProps {
  teamId: string;
  laps: Lap[];
  sectors: SectorTime[];
  results: Result[];
  formatTime: (seconds: number | null | undefined) => string;
  expandedLap: number | null;
  setExpandedLap: (lapNumber: number | null) => void;
  sessionType: string;
  weather: WeatherData | null;
  onCompare: () => void;
}

function TeamLapAnalysis({
  teamId,
  laps,
  sectors,
  results,
  formatTime,
  expandedLap,
  setExpandedLap,
  weather,
  onCompare
}: TeamLapAnalysisProps) {
  const teamResult = results.find(r => r.team.id === teamId);
  
  if (!teamResult) {
    return <p>Team not found</p>;
  }

  // Filter laps by the team's start number
  const teamLaps = laps.filter(l => l.startNumber === teamResult.startNumber);
  const teamSectors = sectors.filter(s => s.startNumber === teamResult.startNumber);
  
  // Group laps by start number (car number) - though for a team there should be just one
  const lapsByDriver = teamLaps.reduce((acc, lap) => {
    if (!acc[lap.startNumber]) {
      acc[lap.startNumber] = [];
    }
    acc[lap.startNumber].push(lap);
    return acc;
  }, {} as Record<number, Lap[]>);

  // Create position graph data - calculate actual race position based on cumulative time
  // In endurance racing, position = who completed the most laps with the lowest total time
  const maxLapNum = teamLaps.length > 0 ? Math.max(...teamLaps.map(l => l.lapNumber)) : 0;

  // Build cumulative time map for ALL cars: startNumber -> lapNumber -> cumulativeTime
  const allStartNumbers = Array.from(new Set(laps.map(l => l.startNumber)));
  const cumulativeMap = new Map<number, Map<number, number>>();
  for (const sn of allStartNumbers) {
    const snLaps = laps.filter(l => l.startNumber === sn).sort((a, b) => a.lapNumber - b.lapNumber);
    const lapCumMap = new Map<number, number>();
    let cumTime = 0;
    for (const lap of snLaps) {
      cumTime += lap.lapTime;
      lapCumMap.set(lap.lapNumber, cumTime);
    }
    cumulativeMap.set(sn, lapCumMap);
  }

  const positionData = Array.from({ length: maxLapNum }, (_, i) => {
    const lapNum = i + 1;
    const teamLapForNum = teamLaps.find(l => l.lapNumber === lapNum);
    
    if (!teamLapForNum) {
      return null;
    }

    // Rank all cars at this lap number:
    // 1) Cars with MORE completed laps rank higher
    // 2) Among cars on the same lap count, lower cumulative time ranks higher
    const rankings: { startNumber: number; lapsCompleted: number; cumTime: number }[] = [];
    for (const sn of allStartNumbers) {
      const snCum = cumulativeMap.get(sn);
      if (!snCum) continue;
      // How many laps has this car completed up to lapNum?
      const completedLaps = snCum.has(lapNum) ? lapNum : 
        Array.from(snCum.keys()).filter(k => k <= lapNum).length;
      if (completedLaps === 0) continue;
      const maxCompletedLap = Math.max(...Array.from(snCum.keys()).filter(k => k <= lapNum));
      const cumTime = snCum.get(maxCompletedLap) || 0;
      rankings.push({ startNumber: sn, lapsCompleted: completedLaps, cumTime });
    }

    // Sort: more laps first, then lower cumulative time
    rankings.sort((a, b) => {
      if (b.lapsCompleted !== a.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
      return a.cumTime - b.cumTime;
    });

    const position = rankings.findIndex(r => r.startNumber === teamResult.startNumber) + 1;
    
    return {
      lap: lapNum,
      position: position > 0 ? position : null,
      lapTime: teamLapForNum.lapTime,
      driverName: teamLapForNum.driver ? `${teamLapForNum.driver.firstName} ${teamLapForNum.driver.lastName}` : 'Unknown'
    };
  }).filter((d): d is { lap: number; position: number; lapTime: number; driverName: string } => d !== null && d.position !== null);

  // Debug log
  if (positionData.length > 0) {
    console.log(`📊 Position graph for ${teamResult.team.name}:`, {
      maxLap: maxLapNum,
      teamLapsCount: teamLaps.length,
      positionDataPoints: positionData.length,
      firstPosition: positionData[0]?.position,
      lastPosition: positionData[positionData.length - 1]?.position
    });
  }

  // Helper function to get weather data for a specific lap
  const getWeatherForLap = (lapNumber: number): { temp: number | null; precipitation: number | null; raining: boolean } => {
    if (!weather || !weather.hourly || !weather.hourly.time || weather.hourly.time.length === 0) {
      return { temp: null, precipitation: null, raining: false };
    }

    try {
      const lapWeather = weather.lapWeather?.find((entry) => entry.lapNumber === lapNumber);
      if (lapWeather) {
        const temp = lapWeather.temperature;
        const precipitation = lapWeather.precipitation;
        const raining = precipitation ? precipitation > 0.1 : false;
        return {
          temp: temp !== null ? Math.round(temp * 10) / 10 : null,
          precipitation: precipitation !== null ? Math.round(precipitation * 10) / 10 : null,
          raining
        };
      }

      // Fallback to closest hourly value if lapWeather is not available
      let closestIndex = 0;
      let closestDiff = Infinity;

      const estimatedLapMinutes = lapNumber * 8.5;
      const sessionStartMinutes = 9 * 60;
      const estimatedRaceTime = sessionStartMinutes + estimatedLapMinutes;

      for (let i = 0; i < weather.hourly.time.length; i++) {
        const timeStr = weather.hourly.time[i];
        const [hours, minutes] = timeStr.split(':').map(Number);
        const weatherMinutes = hours * 60 + minutes;

        const diff = Math.abs(weatherMinutes - estimatedRaceTime);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIndex = i;
        }
      }

      const temp = weather.hourly.temperature_2m ? weather.hourly.temperature_2m[closestIndex] : null;
      const precipitation = weather.hourly.precipitation ? weather.hourly.precipitation[closestIndex] : null;
      const raining = precipitation ? precipitation > 0.1 : false;

      return {
        temp: temp ? Math.round(temp * 10) / 10 : null,
        precipitation: precipitation ? Math.round(precipitation * 10) / 10 : null,
        raining,
      };
    } catch (error) {
      console.error('Error getting weather for lap:', error);
      return { temp: null, precipitation: null, raining: false };
    }
  };

  // Get statistics
  const stats = Object.entries(lapsByDriver).map(([startNum, driverLaps]) => {
    const times = driverLaps.map(l => l.lapTime).sort((a, b) => a - b);
    const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const bestTime = times.length > 0 ? times[0] : 0;
    const worstTime = times.length > 0 ? times[times.length - 1] : 0;
    
    return {
      startNumber: parseInt(startNum),
      lapsCount: driverLaps.length,
      bestTime,
      avgTime,
      worstTime,
      consistency: worstTime - bestTime,
    };
  });

  // Create lap times graph data
  const lapTimesData = teamLaps.map(lap => ({
    lap: lap.lapNumber,
    lapTime: lap.lapTime,
    lapTimeFormatted: formatTime(lap.lapTime),
    driverName: lap.driver ? `${lap.driver.firstName} ${lap.driver.lastName}` : 'Unknown'
  })).sort((a, b) => a.lap - b.lap);

  // Get the final position from the position data (last lap)
  const finalPosition = positionData.length > 0 
    ? positionData[positionData.length - 1].position 
    : teamResult.position;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>
          {teamResult.team.name} - Position #{finalPosition}
        </h3>
        <button
          onClick={onCompare}
          style={{ padding: '6px 14px', cursor: 'pointer', fontSize: '13px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '6px', whiteSpace: 'nowrap' }}
        >
          ⚖ Vergleich
        </button>
      </div>

      {/* Position Trend */}
      {positionData.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h4 style={{ color: '#000' }}>Positionsverlauf</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={positionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="lap" label={{ value: 'Lap', position: 'insideBottomRight', offset: -5 }} />
              <YAxis
                reversed
                label={{ value: 'Position', angle: -90, position: 'insideLeft' }}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const data = props.payload as any;
                  const lapTime = data?.lapTime ? formatTime(data.lapTime) : '-';
                  const driver = data?.driverName || '-';
                  return [`${value}`, `Pos | Driver: ${driver} | Lap: ${lapTime}`];
                }}
                labelFormatter={(label) => `Lap ${label}`}
              />
              <Line
                type="monotone"
                dataKey="position"
                stroke="#3498db"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Lap Times Graph */}
      {lapTimesData.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h4 style={{ color: '#000' }}>Lap Times</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lapTimesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="lap" label={{ value: 'Lap', position: 'insideBottomRight', offset: -5 }} />
              <YAxis 
                label={{ value: 'Lap Time (s)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value, _name, props) => {
                  const seconds = value as number;
                  const driver = (props.payload as any)?.driverName || '-';
                  return [formatTime(seconds), `Driver: ${driver}`];
                }}
                labelFormatter={(label) => `Lap ${label}`}
              />
              <Line 
                type="monotone" 
                dataKey="lapTime" 
                stroke="#2ecc71" 
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      
      <div style={{ marginBottom: '2rem' }}>
        <h4>Lap Time Summary</h4>
        <table style={{ width: '100%', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ color: '#fff' }}>
              <th style={{ color: '#fff' }}>Car #</th>
              <th style={{ color: '#fff' }}>Laps</th>
              <th style={{ color: '#fff' }}>Best Lap</th>
              <th style={{ color: '#fff' }}>Avg Lap</th>
              <th style={{ color: '#fff' }}>Worst Lap</th>
              <th style={{ color: '#fff' }}>Consistency</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(stat => (
              <tr key={stat.startNumber} style={{ color: '#fff' }}>
                <td style={{ fontWeight: 'bold', color: '#fff' }}>{stat.startNumber}</td>
                <td style={{ color: '#fff' }}>{stat.lapsCount}</td>
                <td style={{ color: '#2ecc71' }}>{formatTime(stat.bestTime)}</td>
                <td style={{ color: '#fff' }}>{formatTime(stat.avgTime)}</td>
                <td style={{ color: '#e74c3c' }}>{formatTime(stat.worstTime)}</td>
                <td style={{ color: '#fff' }}>{formatTime(stat.consistency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4>Detailed Lap Times with Sector Analysis</h4>
        {Object.entries(lapsByDriver).map(([startNum, driverLaps]) => (
          <div key={startNum} style={{ marginBottom: '2rem' }}>
            <h5>Car #{startNum}</h5>
            <table style={{ width: '100%' }}>
              <thead>
                <tr style={{ color: '#fff' }}>
                  <th style={{ color: '#fff' }}>Lap</th>
                  <th style={{ color: '#fff' }}>Total Time</th>
                  <th style={{ color: '#fff' }}>Diff to Best</th>
                  <th style={{ color: '#fff' }}>Status</th>
                  <th style={{ color: '#fff' }}>🌡️ Temp</th>
                  <th style={{ color: '#fff' }}>🌧️ Rain</th>
                  <th style={{ color: '#fff' }}>Pit</th>
                  <th style={{ color: '#fff' }}>Pit Time</th>
                  <th style={{ width: '30px', color: '#fff' }}>Sectors</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const times = driverLaps.map(l => l.lapTime).sort((a, b) => a - b);
                  const bestTime = times[0];
                  
                  return driverLaps
                    .sort((a, b) => a.lapNumber - b.lapNumber)
                    .map((lap) => {
                      const diff = lap.lapTime - bestTime;
                      const isGood = diff < 1;
                      const isBest = lap.lapTime === bestTime;
                      const sectorData = teamSectors.find(s => s.startNumber === lap.startNumber && s.lapNumber === lap.lapNumber);
                      const isExpanded = expandedLap === lap.lapNumber * 10000 + lap.startNumber;

                      return (
                        <tr 
                          key={lap.id}
                          style={{
                            backgroundColor: isBest ? '#d5f4e6' : isGood ? '#fef5e7' : '#fadbd8',
                            color: '#000'
                          }}
                        >
                          <td style={{ color: '#000' }}>{lap.lapNumber}</td>
                          <td style={{ fontWeight: 'bold', color: '#000' }}>
                            {formatTime(lap.lapTime)}
                          </td>
                          <td style={{ color: '#000' }}>
                            {isBest ? '🏁 Best' : `+${diff.toFixed(3)}s`}
                          </td>
                          <td style={{ color: '#000' }}>
                            {isBest ? '✓ Best Lap' : isGood ? '✓ Good' : '✗ Slower'}
                          </td>
                          <td style={{ color: '#000' }}>
                            {(() => {
                              const w = getWeatherForLap(lap.lapNumber);
                              return w.temp !== null ? `${w.temp}°C` : 'N/A';
                            })()}
                          </td>
                          <td style={{ color: '#000' }}>
                            {(() => {
                              const w = getWeatherForLap(lap.lapNumber);
                              return w.raining ? `🌧️ ${w.precipitation}mm` : '☀️ Dry';
                            })()}
                          </td>
                          <td style={{ color: '#000' }}>
                            {lap.inPit ? '✅' : '—'}
                          </td>
                          <td style={{ color: '#000' }}>
                            {lap.pitDuration !== null && lap.pitDuration !== undefined
                              ? formatTime(lap.pitDuration)
                              : '—'}
                          </td>
                          <td>
                            <button
                              onClick={() => setExpandedLap(isExpanded ? null : lap.lapNumber * 10000 + lap.startNumber)}
                              style={{
                                padding: '4px 8px',
                                cursor: sectorData ? 'pointer' : 'default',
                                backgroundColor: sectorData ? '#3498db' : '#bdc3c7',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                          </td>
                        </tr>
                      );
                    });
                })()}
              </tbody>
            </table>

            {/* Expanded sector details */}
            {driverLaps.map((lap) => {
              const sectorData = teamSectors.find(s => s.startNumber === lap.startNumber && s.lapNumber === lap.lapNumber);
              const isExpanded = expandedLap === lap.lapNumber * 10000 + lap.startNumber;
              
              if (!isExpanded || !sectorData) return null;

              return (
                <div key={`sectors-${lap.id}`} style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  backgroundColor: '#f0f0f0',
                  borderRadius: '4px'
                }}>
                  <h6 style={{ marginTop: 0 }}>Lap {lap.lapNumber} - Sector Breakdown</h6>
                  <table style={{ width: '100%', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ color: '#fff' }}>
                        <th style={{ color: '#fff' }}>Sector</th>
                        <th style={{ color: '#fff' }}>Time</th>
                        <th style={{ color: '#fff' }}>Contribution to Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: 'S1', time: sectorData.sector1 },
                        { name: 'S2', time: sectorData.sector2 },
                        { name: 'S3', time: sectorData.sector3 },
                        { name: 'S4', time: sectorData.sector4 },
                        { name: 'S5', time: sectorData.sector5 },
                      ].map((sector) => {
                        const percentage = sector.time ? ((sector.time / lap.lapTime) * 100).toFixed(1) : 'N/A';
                        return (
                          <tr key={sector.name} style={{ color: '#fff' }}>
                            <td style={{ fontWeight: 'bold', color: '#fff' }}>{sector.name}</td>
                            <td style={{ color: '#fff' }}>{sector.time ? formatTime(sector.time) : '-'}</td>
                            <td style={{ color: '#fff' }}>{percentage !== 'N/A' ? `${percentage}%` : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TeamComparison Component ────────────────────────────────────────────────

interface TeamComparisonProps {
  teamIdA: string;
  results: Result[];
  laps: Lap[];
  sectors: SectorTime[];
  formatTime: (s: number | null | undefined) => string;
  weather: WeatherData | null;
  sessionType: string;
}

function calcStints(carLaps: Lap[]): Lap[][] {
  const sorted = [...carLaps].sort((a, b) => a.lapNumber - b.lapNumber);
  const stints: Lap[][] = [];
  let current: Lap[] = [];
  for (const lap of sorted) {
    current.push(lap);
    if (lap.inPit) {
      stints.push(current);
      current = [];
    }
  }
  if (current.length > 0) stints.push(current);
  return stints;
}

function TeamComparison({ teamIdA, results, laps, formatTime }: TeamComparisonProps) {
  const [teamIdB, setTeamIdB] = useState<string | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [selectedStintA, setSelectedStintA] = useState(0);
  const [selectedStintB, setSelectedStintB] = useState(0);

  const teamA = results.find(r => r.team.id === teamIdA);
  if (!teamA) return <p>Team nicht gefunden</p>;

  const classA = teamA.vehicle?.vehicleClass;

  const availableForB = showAllClasses
    ? results.filter(r => r.team.id !== teamIdA)
    : results.filter(r => r.team.id !== teamIdA && r.vehicle?.vehicleClass === classA);

  const teamB = teamIdB ? results.find(r => r.team.id === teamIdB) : null;

  const lapsA = laps.filter(l => l.startNumber === teamA.startNumber).sort((a, b) => a.lapNumber - b.lapNumber);
  const lapsB = teamB ? laps.filter(l => l.startNumber === teamB.startNumber).sort((a, b) => a.lapNumber - b.lapNumber) : [];

  const stintsA = calcStints(lapsA);
  const stintsB = calcStints(lapsB);

  // ── Rundenzeiten Chart Data ──────────────────────────────────────────────
  const allLapNums = Array.from(new Set([...lapsA.map(l => l.lapNumber), ...lapsB.map(l => l.lapNumber)])).sort((a, b) => a - b);
  const lapChartData = allLapNums.map(lapNum => ({
    lap: lapNum,
    A: lapsA.find(l => l.lapNumber === lapNum)?.lapTime ?? null,
    B: lapsB.find(l => l.lapNumber === lapNum)?.lapTime ?? null,
  }));

  // ── Stats ──────────────────────────────────────────────────────────────
  const calcStats = (lapList: Lap[]) => {
    if (lapList.length === 0) return null;
    const times = lapList.map(l => l.lapTime).sort((a, b) => a - b);
    return {
      best: times[0],
      avg: times.reduce((s, t) => s + t, 0) / times.length,
      worst: times[times.length - 1],
      consistency: times[times.length - 1] - times[0],
    };
  };
  const statsA = calcStats(lapsA);
  const statsB = calcStats(lapsB);

  // ── Stints Chart Data ──────────────────────────────────────────────────
  const stintDataA = stintsA[selectedStintA] ?? [];
  const stintDataB = stintsB[selectedStintB] ?? [];
  const maxStintLen = Math.max(stintDataA.length, stintDataB.length);
  const stintChartData = Array.from({ length: maxStintLen }, (_, i) => ({
    stintLap: i + 1,
    A: stintDataA[i]?.lapTime ?? null,
    B: stintDataB[i]?.lapTime ?? null,
  }));

  const COLOR_A = '#3498db';
  const COLOR_B = '#e74c3c';

  const labelA = `#${teamA.startNumber} ${teamA.team.name}`;
  const labelB = teamB ? `#${teamB.startNumber} ${teamB.team.name}` : 'Car B';

  return (
    <div>
      {/* ── Header: Car A + Car B Auswahl ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Car A */}
        <div style={{ padding: '1rem', border: `2px solid ${COLOR_A}`, borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: COLOR_A, fontWeight: 'bold', marginBottom: '0.25rem' }}>AUTO A</div>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{teamA.team.name}</div>
          <div style={{ color: '#888', fontSize: '0.875rem' }}>#{teamA.startNumber} · {teamA.vehicle?.model}</div>
          <div style={{ color: '#aaa', fontSize: '0.8rem' }}>{classA}</div>
        </div>

        {/* Car B */}
        <div style={{ padding: '1rem', border: `2px solid ${teamB ? COLOR_B : '#555'}`, borderRadius: '8px' }}>
          <div style={{ fontSize: '0.75rem', color: COLOR_B, fontWeight: 'bold', marginBottom: '0.25rem' }}>AUTO B</div>
          {teamB ? (
            <>
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{teamB.team.name}</div>
              <div style={{ color: '#888', fontSize: '0.875rem' }}>#{teamB.startNumber} · {teamB.vehicle?.model}</div>
              <div style={{ color: '#aaa', fontSize: '0.8rem' }}>{teamB.vehicle?.vehicleClass}</div>
            </>
          ) : (
            <div style={{ color: '#888', fontSize: '0.875rem' }}>Noch kein Auto ausgewählt</div>
          )}
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={teamIdB ?? ''}
              onChange={e => setTeamIdB(e.target.value || null)}
              style={{ padding: '0.4rem', flex: 1, minWidth: 0 }}
            >
              <option value="">— Auto wählen —</option>
              {availableForB
                .sort((a, b) => a.startNumber - b.startNumber)
                .map(r => (
                  <option key={r.team.id} value={r.team.id}>
                    #{r.startNumber} {r.team.name} ({r.vehicle?.vehicleClass})
                  </option>
                ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', color: '#aaa' }}>
            <input
              type="checkbox"
              checked={showAllClasses}
              onChange={e => { setShowAllClasses(e.target.checked); setTeamIdB(null); }}
            />
            Alle Klassen anzeigen
          </label>
        </div>
      </div>

      {!teamB && (
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '1rem' }}>
          Wähle Auto B um den Vergleich zu starten.
        </p>
      )}

      {teamB && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

          {/* ── TOP LEFT: Gesamtvergleich ── */}
          <div style={{ padding: '1rem', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>Gesamtvergleich — Rundenzeiten</h4>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={lapChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="lap" stroke="#888" label={{ value: 'Runde', position: 'insideBottomRight', offset: -5, fill: '#888' }} />
                <YAxis stroke="#888" label={{ value: 'Zeit (s)', angle: -90, position: 'insideLeft', fill: '#888' }} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatTime(value), name === 'A' ? labelA : labelB]}
                  labelFormatter={(l) => `Runde ${l}`}
                  contentStyle={{ backgroundColor: '#222', border: '1px solid #444' }}
                />
                <Legend formatter={(v) => v === 'A' ? labelA : labelB} />
                <Line type="monotone" dataKey="A" stroke={COLOR_A} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="B" stroke={COLOR_B} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── TOP RIGHT: Boxenstopps ── */}
          {(() => {
            const pitStopsA = lapsA.filter(l => l.inPit === true);
            const pitStopsB = lapsB.filter(l => l.inPit === true);
            const maxRows = Math.max(pitStopsA.length, pitStopsB.length);
            return (
              <div style={{ padding: '1rem', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
                <h4 style={{ marginTop: 0 }}>Boxenstopps</h4>
                {maxRows === 0 ? (
                  <p style={{ color: '#888', textAlign: 'center' }}>Keine Boxenstoppdaten verfügbar.</p>
                ) : (
                  <table style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Stop</th>
                        <th style={{ color: COLOR_A }}>Runde (A)</th>
                        <th style={{ color: COLOR_A }}>Zeit (A)</th>
                        <th style={{ color: COLOR_B }}>Runde (B)</th>
                        <th style={{ color: COLOR_B }}>Zeit (B)</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxRows }, (_, i) => {
                        const pA = pitStopsA[i];
                        const pB = pitStopsB[i];
                        const durA = pA?.pitDuration ?? null;
                        const durB = pB?.pitDuration ?? null;
                        const delta = durA != null && durB != null ? durA - durB : null;
                        return (
                          <tr key={i}>
                            <td style={{ color: '#aaa', fontWeight: 'bold' }}>Stop {i + 1}</td>
                            <td style={{ color: COLOR_A }}>{pA ? `R${pA.lapNumber}` : '—'}</td>
                            <td style={{ color: COLOR_A }}>{durA != null ? formatTime(durA) : '—'}</td>
                            <td style={{ color: COLOR_B }}>{pB ? `R${pB.lapNumber}` : '—'}</td>
                            <td style={{ color: COLOR_B }}>{durB != null ? formatTime(durB) : '—'}</td>
                            <td style={{ color: delta == null ? '#888' : delta < 0 ? '#2ecc71' : delta > 0 ? '#e74c3c' : '#888', fontWeight: 'bold' }}>
                              {delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(3) + 's' : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const totalA = pitStopsA.reduce((sum, l) => sum + (l.pitDuration ?? 0), 0);
                        const totalB = pitStopsB.reduce((sum, l) => sum + (l.pitDuration ?? 0), 0);
                        const hasA = pitStopsA.some(l => l.pitDuration != null);
                        const hasB = pitStopsB.some(l => l.pitDuration != null);
                        const totalDelta = hasA && hasB ? totalA - totalB : null;
                        return (
                          <tr style={{ borderTop: '2px solid #555' }}>
                            <td style={{ color: '#fff', fontWeight: 'bold' }}>Gesamt</td>
                            <td style={{ color: COLOR_A }}>{pitStopsA.length} Stops</td>
                            <td style={{ color: COLOR_A, fontWeight: 'bold' }}>{hasA ? formatTime(totalA) : '—'}</td>
                            <td style={{ color: COLOR_B }}>{pitStopsB.length} Stops</td>
                            <td style={{ color: COLOR_B, fontWeight: 'bold' }}>{hasB ? formatTime(totalB) : '—'}</td>
                            <td style={{ color: totalDelta == null ? '#888' : totalDelta < 0 ? '#2ecc71' : totalDelta > 0 ? '#e74c3c' : '#888', fontWeight: 'bold', fontSize: '1.05em' }}>
                              {totalDelta != null ? (totalDelta >= 0 ? '+' : '') + totalDelta.toFixed(3) + 's' : '—'}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

          {/* ── BOTTOM LEFT: Stint Vergleich ── */}
          <div style={{ padding: '1rem', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>Stint Vergleich</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', color: COLOR_A, fontSize: '0.8rem', marginBottom: '0.25rem' }}>{labelA} — Stint</label>
                <select value={selectedStintA} onChange={e => setSelectedStintA(Number(e.target.value))} style={{ padding: '0.4rem', width: '100%' }}>
                  {stintsA.map((_, i) => (
                    <option key={i} value={i}>Stint {i + 1} ({stintsA[i].length} Runden, R{stintsA[i][0]?.lapNumber}–R{stintsA[i][stintsA[i].length - 1]?.lapNumber})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: COLOR_B, fontSize: '0.8rem', marginBottom: '0.25rem' }}>{labelB} — Stint</label>
                <select value={selectedStintB} onChange={e => setSelectedStintB(Number(e.target.value))} style={{ padding: '0.4rem', width: '100%' }}>
                  {stintsB.map((_, i) => (
                    <option key={i} value={i}>Stint {i + 1} ({stintsB[i].length} Runden, R{stintsB[i][0]?.lapNumber}–R{stintsB[i][stintsB[i].length - 1]?.lapNumber})</option>
                  ))}
                </select>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stintChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="stintLap" stroke="#888" label={{ value: 'Stint-Runde', position: 'insideBottomRight', offset: -5, fill: '#888' }} />
                <YAxis stroke="#888" label={{ value: 'Zeit (s)', angle: -90, position: 'insideLeft', fill: '#888' }} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatTime(value), name === 'A' ? labelA : labelB]}
                  labelFormatter={(l) => `Stint-Runde ${l}`}
                  contentStyle={{ backgroundColor: '#222', border: '1px solid #444' }}
                />
                <Legend formatter={(v) => v === 'A' ? `${labelA} · Stint ${selectedStintA + 1}` : `${labelB} · Stint ${selectedStintB + 1}`} />
                <Line type="monotone" dataKey="A" stroke={COLOR_A} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="B" stroke={COLOR_B} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* ── BOTTOM RIGHT: Statistiken ── */}
          <div style={{ padding: '1rem', backgroundColor: '#1a1a2e', borderRadius: '8px' }}>
            <h4 style={{ marginTop: 0 }}>Statistiken</h4>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th></th>
                  <th style={{ color: COLOR_A }}>{labelA}</th>
                  <th style={{ color: COLOR_B }}>{labelB}</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Beste Runde', keyName: 'best' as const },
                  { label: 'Schnitt', keyName: 'avg' as const },
                  { label: 'Schlechteste', keyName: 'worst' as const },
                  { label: 'Konsistenz', keyName: 'consistency' as const },
                ].map(({ label, keyName }) => {
                  const vA = statsA?.[keyName];
                  const vB = statsB?.[keyName];
                  const delta = vA != null && vB != null ? vA - vB : null;
                  return (
                    <tr key={keyName}>
                      <td style={{ color: '#aaa' }}>{label}</td>
                      <td style={{ color: COLOR_A }}>{formatTime(vA)}</td>
                      <td style={{ color: COLOR_B }}>{formatTime(vB)}</td>
                      <td style={{ color: delta == null ? '#888' : delta < 0 ? '#2ecc71' : delta > 0 ? '#e74c3c' : '#888' }}>
                        {delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(3) + 's' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  );
}

export default SessionDetails;
