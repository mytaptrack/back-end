# GraphQL Examples

This document provides practical examples of using the MyTapTrack GraphQL API for common use cases.

## Table of Contents

- [Authentication Setup](#authentication-setup)
- [Student Management](#student-management)
- [Behavior Tracking](#behavior-tracking)
- [Service Management](#service-management)
- [Device Configuration](#device-configuration)
- [Data Collection](#data-collection)
- [Reporting](#reporting)
- [Real-time Subscriptions](#real-time-subscriptions)
- [Error Handling](#error-handling)

## Authentication Setup

### Apollo Client Setup with Cognito

```typescript
import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import { Auth } from 'aws-amplify';

const httpLink = createHttpLink({
  uri: process.env.REACT_APP_GRAPHQL_ENDPOINT,
});

const authLink = setContext(async (_, { headers }) => {
  try {
    const token = (await Auth.currentSession()).getIdToken().getJwtToken();
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : "",
      }
    };
  } catch (error) {
    console.error('Error getting auth token:', error);
    return { headers };
  }
});

const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path, extensions }) => {
      console.error(
        `GraphQL error: Message: ${message}, Location: ${locations}, Path: ${path}`,
        extensions
      );
    });
  }

  if (networkError) {
    console.error(`Network error: ${networkError}`);
  }
});

const client = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Student: {
        keyFields: ["studentId"],
      },
      Service: {
        keyFields: ["id"],
      },
      Trackable: {
        keyFields: ["id"],
      }
    }
  }),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all'
    },
    query: {
      errorPolicy: 'all'
    }
  }
});

export default client;
```

## Student Management

### Creating a New Student

```typescript
import { gql, useMutation } from '@apollo/client';

const CREATE_STUDENT = gql`
  mutation CreateStudent($student: StudentInput!) {
    updateStudent(student: $student) {
      studentId
      license
      details {
        firstName
        lastName
        nickname
        schoolId
        tags {
          tag
          type
        }
      }
      behaviors {
        id
        name
        desc
        isDuration
        intensity
        targets {
          measurement
          target
          targetType
          progress
        }
      }
      services {
        id
        name
        startDate
        endDate
        target
        currentBalance
      }
      restrictions {
        info
        data
        behavior
        service
        manage
      }
    }
  }
`;

function CreateStudentForm() {
  const [createStudent, { data, loading, error }] = useMutation(CREATE_STUDENT);

  const handleSubmit = async (formData) => {
    try {
      const result = await createStudent({
        variables: {
          student: {
            license: "LICENSE123",
            details: {
              firstName: formData.firstName,
              lastName: formData.lastName,
              nickname: formData.nickname,
              schoolId: formData.schoolId,
              tags: [
                { tag: "Grade 3", type: "grade" },
                { tag: "Special Education", type: "program" }
              ]
            },
            behaviors: [
              {
                name: "On Task Behavior",
                desc: "Student remains focused on assigned task",
                isDuration: true,
                daytime: true,
                baseline: false,
                intensity: 5,
                targets: [
                  {
                    measurement: "duration",
                    target: 80,
                    targetType: "increase",
                    progress: 0
                  }
                ],
                tags: [
                  { tag: "Academic", type: "category" }
                ]
              }
            ],
            services: [
              {
                name: "Speech Therapy",
                desc: "Individual speech therapy sessions",
                startDate: Date.now(),
                endDate: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
                target: 30, // 30 minutes per session
                modifications: ["Individual", "Quiet Environment"]
              }
            ],
            restrictions: {
              info: "edit",
              data: "edit",
              schedules: "view",
              devices: "edit",
              team: "view",
              comments: "edit",
              behavior: "edit",
              behaviors: [],
              abc: "edit",
              milestones: "edit",
              reports: "view",
              notifications: "edit",
              reportsOverride: false,
              transferLicense: false,
              documents: "edit",
              service: "edit",
              services: [],
              serviceData: "edit",
              serviceGoals: "edit",
              serviceSchedule: "edit"
            }
          }
        }
      });
      
      console.log('Student created:', result.data.updateStudent);
    } catch (err) {
      console.error('Error creating student:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Student'}
      </button>
      {error && <div>Error: {error.message}</div>}
    </form>
  );
}
```

### Fetching Student List

```typescript
const GET_STUDENTS = gql`
  query GetStudents($params: getStudentsParams) {
    getStudents(params: $params) {
      studentId
      details {
        firstName
        lastName
        nickname
        schoolId
        tags {
          tag
          type
        }
      }
      tracking {
        service
        behavior
      }
      lastTracked
      behaviors {
        id
        name
        isDuration
        intensity
      }
      abc {
        name
        antecedents
        consequences
      }
    }
  }
`;

function StudentList() {
  const { data, loading, error, refetch } = useQuery(GET_STUDENTS, {
    variables: {
      params: {
        behavior: true,
        service: true,
        trackable: true
      }
    },
    pollInterval: 30000 // Poll every 30 seconds
  });

  if (loading) return <div>Loading students...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Students ({data.getStudents.length})</h2>
      <button onClick={() => refetch()}>Refresh</button>
      
      {data.getStudents.map(student => (
        <div key={student.studentId} className="student-card">
          <h3>
            {student.details.firstName} {student.details.lastName}
            {student.details.nickname && ` (${student.details.nickname})`}
          </h3>
          
          <p>School ID: {student.details.schoolId}</p>
          <p>Last Tracked: {student.lastTracked || 'Never'}</p>
          
          <div>
            <strong>Tracking:</strong>
            {student.tracking.behavior && <span> Behaviors</span>}
            {student.tracking.service && <span> Services</span>}
          </div>
          
          <div>
            <strong>Behaviors ({student.behaviors.length}):</strong>
            {student.behaviors.map(behavior => (
              <span key={behavior.id} className="behavior-tag">
                {behavior.name}
                {behavior.isDuration && ' (Duration)'}
                {behavior.intensity && ` [${behavior.intensity}]`}
              </span>
            ))}
          </div>
          
          {student.details.tags.length > 0 && (
            <div>
              <strong>Tags:</strong>
              {student.details.tags.map(tag => (
                <span key={`${tag.type}-${tag.tag}`} className={`tag tag-${tag.type}`}>
                  {tag.tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Behavior Tracking

### Adding Behavior Data

```typescript
const ADD_BEHAVIOR_DATA = gql`
  mutation AddBehaviorData($studentId: String!, $data: ReportDataInput!) {
    updateDataInReport(studentId: $studentId, data: $data) {
      dateEpoc
      behavior
      reported
      score
      isManual
      source {
        device
        rater
      }
      abc {
        a
        c
      }
      duration
      intensity
    }
  }
`;

function BehaviorTracker({ studentId, behaviorId }) {
  const [addBehaviorData] = useMutation(ADD_BEHAVIOR_DATA);
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState(null);

  const startTracking = () => {
    setIsTracking(true);
    setStartTime(Date.now());
  };

  const stopTracking = async (intensity = 1, antecedent = '', consequence = '') => {
    if (!isTracking || !startTime) return;

    const duration = Date.now() - startTime;
    
    try {
      await addBehaviorData({
        variables: {
          studentId,
          data: {
            dateEpoc: startTime,
            behavior: behaviorId,
            reported: true,
            score: intensity,
            isManual: true,
            source: {
              device: "web-app",
              rater: "current-user-id"
            },
            abc: antecedent || consequence ? {
              a: antecedent,
              c: consequence
            } : null,
            duration,
            intensity
          }
        }
      });
      
      setIsTracking(false);
      setStartTime(null);
      console.log('Behavior data recorded successfully');
    } catch (error) {
      console.error('Error recording behavior data:', error);
    }
  };

  const recordFrequencyEvent = async (intensity = 1, antecedent = '', consequence = '') => {
    try {
      await addBehaviorData({
        variables: {
          studentId,
          data: {
            dateEpoc: Date.now(),
            behavior: behaviorId,
            reported: true,
            score: intensity,
            isManual: true,
            source: {
              device: "web-app",
              rater: "current-user-id"
            },
            abc: antecedent || consequence ? {
              a: antecedent,
              c: consequence
            } : null,
            intensity
          }
        }
      });
      
      console.log('Frequency event recorded successfully');
    } catch (error) {
      console.error('Error recording frequency event:', error);
    }
  };

  return (
    <div className="behavior-tracker">
      <h3>Behavior Tracker</h3>
      
      {/* Duration Tracking */}
      <div>
        <h4>Duration Tracking</h4>
        {!isTracking ? (
          <button onClick={startTracking}>Start Tracking</button>
        ) : (
          <div>
            <p>Tracking... ({Math.floor((Date.now() - startTime) / 1000)}s)</p>
            <button onClick={() => stopTracking(1)}>Stop (Low)</button>
            <button onClick={() => stopTracking(5)}>Stop (Medium)</button>
            <button onClick={() => stopTracking(10)}>Stop (High)</button>
          </div>
        )}
      </div>
      
      {/* Frequency Tracking */}
      <div>
        <h4>Frequency Tracking</h4>
        <button onClick={() => recordFrequencyEvent(1)}>Record Event (Low)</button>
        <button onClick={() => recordFrequencyEvent(5)}>Record Event (Medium)</button>
        <button onClick={() => recordFrequencyEvent(10)}>Record Event (High)</button>
      </div>
      
      {/* ABC Data Collection */}
      <div>
        <h4>ABC Data</h4>
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          recordFrequencyEvent(
            parseInt(formData.get('intensity')),
            formData.get('antecedent'),
            formData.get('consequence')
          );
          e.target.reset();
        }}>
          <input name="antecedent" placeholder="Antecedent" />
          <input name="consequence" placeholder="Consequence" />
          <select name="intensity">
            <option value="1">Low (1)</option>
            <option value="5">Medium (5)</option>
            <option value="10">High (10)</option>
          </select>
          <button type="submit">Record ABC Event</button>
        </form>
      </div>
    </div>
  );
}
```

## Service Management

### Tracking Service Minutes

```typescript
const ADD_SERVICE_DATA = gql`
  mutation AddServiceData($studentId: String!, $data: ReportDataInput!) {
    updateDataInReport(studentId: $studentId, data: $data) {
      dateEpoc
      service
      duration
      reported
      isManual
      source {
        device
        rater
      }
      modifications
      serviceProgress {
        progress
        measurements {
          name
          value
        }
      }
    }
  }
`;

function ServiceTracker({ studentId, serviceId, serviceName }) {
  const [addServiceData] = useMutation(ADD_SERVICE_DATA);
  const [isProviding, setIsProviding] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [modifications, setModifications] = useState([]);

  const startService = () => {
    setIsProviding(true);
    setStartTime(Date.now());
  };

  const endService = async (progressData = null) => {
    if (!isProviding || !startTime) return;

    const duration = Date.now() - startTime;
    
    try {
      await addServiceData({
        variables: {
          studentId,
          data: {
            dateEpoc: startTime,
            service: serviceId,
            duration,
            reported: true,
            isManual: true,
            source: {
              device: "web-app",
              rater: "current-user-id"
            },
            modifications,
            serviceProgress: progressData ? {
              progress: progressData.progress,
              measurements: progressData.measurements
            } : null
          }
        }
      });
      
      setIsProviding(false);
      setStartTime(null);
      setModifications([]);
      console.log('Service data recorded successfully');
    } catch (error) {
      console.error('Error recording service data:', error);
    }
  };

  const addModification = (modification) => {
    setModifications(prev => [...prev, modification]);
  };

  const removeModification = (index) => {
    setModifications(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="service-tracker">
      <h3>{serviceName} Tracker</h3>
      
      {!isProviding ? (
        <button onClick={startService}>Start Service</button>
      ) : (
        <div>
          <p>Providing service... ({Math.floor((Date.now() - startTime) / 60000)} minutes)</p>
          
          <div>
            <h4>Modifications</h4>
            <select onChange={(e) => {
              if (e.target.value) {
                addModification(e.target.value);
                e.target.value = '';
              }
            }}>
              <option value="">Add modification...</option>
              <option value="Individual">Individual</option>
              <option value="Small Group">Small Group</option>
              <option value="Quiet Environment">Quiet Environment</option>
              <option value="Visual Supports">Visual Supports</option>
              <option value="Extended Time">Extended Time</option>
            </select>
            
            {modifications.map((mod, index) => (
              <span key={index} className="modification-tag">
                {mod}
                <button onClick={() => removeModification(index)}>×</button>
              </span>
            ))}
          </div>
          
          <div>
            <h4>End Service</h4>
            <button onClick={() => endService()}>End Service</button>
            <button onClick={() => endService({
              progress: 75,
              measurements: [
                { name: "Goal 1", value: 80 },
                { name: "Goal 2", value: 70 }
              ]
            })}>End with Progress Data</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

## Device Configuration

### Setting Up Mobile App

```typescript
const CREATE_APP = gql`
  mutation CreateApp($appConfig: AppDefinitionInput!) {
    updateApp(appConfig: $appConfig) {
      deviceId
    }
  }
`;

const GET_STUDENTS_FOR_APP = gql`
  query GetStudentsForApp {
    getStudents(params: { trackable: true }) {
      studentId
      details {
        firstName
        lastName
      }
      behaviors {
        id
        name
        isDuration
        intensity
      }
      responses {
        id
        name
      }
      services {
        id
        name
      }
    }
  }
`;

function AppConfigurationForm({ license }) {
  const [createApp] = useMutation(CREATE_APP);
  const { data: studentsData } = useQuery(GET_STUDENTS_FOR_APP);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [appName, setAppName] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const result = await createApp({
        variables: {
          appConfig: {
            license,
            name: appName,
            textAlerts: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            tags: [
              { tag: "Mobile", type: "device" },
              { tag: "Classroom", type: "location" }
            ],
            studentConfigs: selectedStudents.map((student, index) => ({
              studentId: student.studentId,
              studentName: `${student.details.firstName} ${student.details.lastName}`,
              groups: ["Default"],
              behaviors: student.behaviors.map((behavior, behaviorIndex) => ({
                id: behavior.id,
                abc: true,
                order: behaviorIndex + 1,
                intensity: behavior.intensity > 0
              })),
              responses: student.responses.map((response, responseIndex) => ({
                id: response.id,
                order: responseIndex + 1
              })),
              services: student.services.map((service, serviceIndex) => ({
                id: service.id,
                order: serviceIndex + 1
              }))
            }))
          }
        }
      });
      
      console.log('App created with device ID:', result.data.updateApp.deviceId);
    } catch (error) {
      console.error('Error creating app:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>App Name:</label>
        <input
          type="text"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          required
        />
      </div>
      
      <div>
        <label>Select Students:</label>
        {studentsData?.getStudents.map(student => (
          <div key={student.studentId}>
            <input
              type="checkbox"
              id={student.studentId}
              checked={selectedStudents.some(s => s.studentId === student.studentId)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedStudents(prev => [...prev, student]);
                } else {
                  setSelectedStudents(prev => 
                    prev.filter(s => s.studentId !== student.studentId)
                  );
                }
              }}
            />
            <label htmlFor={student.studentId}>
              {student.details.firstName} {student.details.lastName}
              ({student.behaviors.length} behaviors, {student.services.length} services)
            </label>
          </div>
        ))}
      </div>
      
      <button type="submit">Create App</button>
    </form>
  );
}
```

## Data Collection

### Bulk Data Import

```typescript
const BULK_DATA_IMPORT = gql`
  mutation BulkDataImport($events: [ReportEventDataInput!]!) {
    bulkImport: studentDataChange(input: $events) {
      studentId
      dateEpoc
      behavior
      service
      duration
      intensity
    }
  }
`;

function BulkDataImporter() {
  const [bulkImport] = useMutation(BULK_DATA_IMPORT);
  const [csvData, setCsvData] = useState('');

  const parseCsvData = (csv) => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim();
      });
      return row;
    });
  };

  const handleImport = async () => {
    try {
      const parsedData = parseCsvData(csvData);
      
      const events = parsedData.map(row => ({
        studentId: row.studentId,
        userId: "current-user-id",
        dateEpoc: parseInt(row.timestamp),
        behavior: row.behaviorId || null,
        service: row.serviceId || null,
        reported: true,
        score: row.intensity ? parseInt(row.intensity) : null,
        isManual: true,
        source: {
          device: row.device || "bulk-import",
          rater: row.rater || "system"
        },
        duration: row.duration ? parseInt(row.duration) : null,
        intensity: row.intensity ? parseInt(row.intensity) : null,
        abc: (row.antecedent || row.consequence) ? {
          a: row.antecedent || '',
          c: row.consequence || ''
        } : null
      }));

      await bulkImport({
        variables: { events }
      });
      
      console.log(`Imported ${events.length} events successfully`);
      setCsvData('');
    } catch (error) {
      console.error('Error importing data:', error);
    }
  };

  return (
    <div>
      <h3>Bulk Data Import</h3>
      <p>CSV Format: studentId,timestamp,behaviorId,serviceId,duration,intensity,antecedent,consequence,device,rater</p>
      
      <textarea
        value={csvData}
        onChange={(e) => setCsvData(e.target.value)}
        placeholder="Paste CSV data here..."
        rows={10}
        cols={80}
      />
      
      <br />
      <button onClick={handleImport} disabled={!csvData.trim()}>
        Import Data
      </button>
    </div>
  );
}
```

## Reporting

### Generating Reports

```typescript
const GET_REPORT_DATA = gql`
  query GetReportData($studentId: String!, $startDate: String!, $endDate: String!, $scope: ReportScope!) {
    getData(studentId: $studentId, startDate: $startDate, endDate: $endDate, scope: $scope) {
      data {
        dateEpoc
        behavior
        reported
        score
        duration
        intensity
        source {
          device
          rater
        }
        abc {
          a
          c
        }
      }
      services {
        dateEpoc
        service
        duration
        modifications
        serviceProgress {
          progress
          measurements {
            name
            value
          }
        }
      }
      raters {
        rater
        name
      }
      startMillis
      endMillis
    }
  }
`;

function ReportGenerator({ studentId }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState({ behavior: true, service: true });
  
  const { data, loading, error, refetch } = useQuery(GET_REPORT_DATA, {
    variables: {
      studentId,
      startDate,
      endDate,
      scope
    },
    skip: !startDate || !endDate
  });

  const generateReport = () => {
    if (!startDate || !endDate) return;
    refetch();
  };

  const exportToCsv = () => {
    if (!data?.getData) return;

    const behaviorData = data.getData.data.map(item => ({
      Date: new Date(item.dateEpoc).toISOString(),
      Type: 'Behavior',
      Item: item.behavior,
      Duration: item.duration || '',
      Intensity: item.intensity || '',
      Score: item.score || '',
      Antecedent: item.abc?.a || '',
      Consequence: item.abc?.c || '',
      Device: item.source.device,
      Rater: item.source.rater
    }));

    const serviceData = data.getData.services.map(item => ({
      Date: new Date(item.dateEpoc).toISOString(),
      Type: 'Service',
      Item: item.service,
      Duration: item.duration || '',
      Intensity: '',
      Score: '',
      Antecedent: '',
      Consequence: '',
      Device: item.source.device,
      Rater: item.source.rater,
      Modifications: item.modifications.join('; '),
      Progress: item.serviceProgress?.progress || ''
    }));

    const allData = [...behaviorData, ...serviceData];
    const csv = [
      Object.keys(allData[0]).join(','),
      ...allData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${studentId}-${startDate}-${endDate}.csv`;
    a.click();
  };

  return (
    <div>
      <h3>Report Generator</h3>
      
      <div>
        <label>Start Date:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      
      <div>
        <label>End Date:</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>
      
      <div>
        <label>
          <input
            type="checkbox"
            checked={scope.behavior}
            onChange={(e) => setScope(prev => ({ ...prev, behavior: e.target.checked }))}
          />
          Include Behaviors
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={scope.service}
            onChange={(e) => setScope(prev => ({ ...prev, service: e.target.checked }))}
          />
          Include Services
        </label>
      </div>
      
      <button onClick={generateReport} disabled={!startDate || !endDate}>
        Generate Report
      </button>
      
      {loading && <p>Loading report data...</p>}
      {error && <p>Error: {error.message}</p>}
      
      {data?.getData && (
        <div>
          <h4>Report Summary</h4>
          <p>Behavior Events: {data.getData.data.length}</p>
          <p>Service Events: {data.getData.services.length}</p>
          <p>Date Range: {new Date(data.getData.startMillis).toLocaleDateString()} - {new Date(data.getData.endMillis).toLocaleDateString()}</p>
          
          <button onClick={exportToCsv}>Export to CSV</button>
          
          <div>
            <h5>Raters</h5>
            {data.getData.raters.map(rater => (
              <span key={rater.rater}>{rater.name} </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## Real-time Subscriptions

### Student Data Changes

```typescript
const STUDENT_DATA_SUBSCRIPTION = gql`
  subscription OnStudentDataChange($userId: String!, $studentId: String!) {
    onStudentDataChange(userId: $userId, studentId: $studentId) {
      studentId
      userId
      dateEpoc
      behavior
      service
      reported
      score
      source {
        device
        rater
      }
      duration
      intensity
      abc {
        a
        c
      }
    }
  }
`;

function RealTimeDataMonitor({ userId, studentId }) {
  const [events, setEvents] = useState([]);
  
  const { data, loading, error } = useSubscription(STUDENT_DATA_SUBSCRIPTION, {
    variables: { userId, studentId },
    onSubscriptionData: ({ subscriptionData }) => {
      if (subscriptionData.data) {
        setEvents(prev => [subscriptionData.data.onStudentDataChange, ...prev.slice(0, 49)]);
      }
    }
  });

  return (
    <div>
      <h3>Real-time Data Monitor</h3>
      {loading && <p>Connecting to real-time updates...</p>}
      {error && <p>Subscription error: {error.message}</p>}
      
      <div>
        <h4>Recent Events ({events.length})</h4>
        {events.map((event, index) => (
          <div key={index} className="event-item">
            <span className="timestamp">
              {new Date(event.dateEpoc).toLocaleTimeString()}
            </span>
            
            {event.behavior && (
              <span className="behavior">
                Behavior: {event.behavior}
                {event.duration && ` (${Math.floor(event.duration / 1000)}s)`}
                {event.intensity && ` [${event.intensity}]`}
              </span>
            )}
            
            {event.service && (
              <span className="service">
                Service: {event.service}
                {event.duration && ` (${Math.floor(event.duration / 60000)}min)`}
              </span>
            )}
            
            <span className="source">
              {event.source.device} - {event.source.rater}
            </span>
            
            {event.abc && (
              <div className="abc-data">
                A: {event.abc.a} | C: {event.abc.c}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### License Changes

```typescript
const LICENSE_CHANGE_SUBSCRIPTION = gql`
  subscription OnUserLicenseChange($userId: String!) {
    onUserLicenseChange(userId: $userId) {
      license
      customer
      features {
        behaviorTracking
        serviceTracking
        devices
        manage
        notifications
      }
      userId
    }
  }
`;

function LicenseMonitor({ userId }) {
  const [licenseHistory, setLicenseHistory] = useState([]);
  
  useSubscription(LICENSE_CHANGE_SUBSCRIPTION, {
    variables: { userId },
    onSubscriptionData: ({ subscriptionData }) => {
      if (subscriptionData.data) {
        const licenseData = subscriptionData.data.onUserLicenseChange;
        setLicenseHistory(prev => [
          {
            ...licenseData,
            timestamp: Date.now()
          },
          ...prev.slice(0, 9)
        ]);
      }
    }
  });

  return (
    <div>
      <h3>License Change Monitor</h3>
      
      {licenseHistory.map((change, index) => (
        <div key={index} className="license-change">
          <div className="timestamp">
            {new Date(change.timestamp).toLocaleString()}
          </div>
          <div>License: {change.license}</div>
          <div>Customer: {change.customer}</div>
          <div>Features: 
            {change.features.behaviorTracking && ' Behaviors'}
            {change.features.serviceTracking && ' Services'}
            {change.features.devices && ' Devices'}
            {change.features.manage && ' Management'}
            {change.features.notifications && ' Notifications'}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Error Handling

### Comprehensive Error Handling

```typescript
import { ApolloError } from '@apollo/client';

function handleGraphQLError(error: ApolloError) {
  // Network errors
  if (error.networkError) {
    console.error('Network error:', error.networkError);
    
    if (error.networkError.statusCode === 401) {
      // Handle authentication error
      Auth.signOut();
      window.location.href = '/login';
      return;
    }
    
    if (error.networkError.statusCode >= 500) {
      // Handle server errors
      showNotification('Server error. Please try again later.', 'error');
      return;
    }
  }

  // GraphQL errors
  if (error.graphQLErrors?.length > 0) {
    error.graphQLErrors.forEach(({ message, extensions, path }) => {
      console.error(`GraphQL error: ${message}`, { extensions, path });
      
      switch (extensions?.code) {
        case 'UNAUTHORIZED':
          showNotification('You do not have permission for this action.', 'error');
          break;
          
        case 'STUDENT_NOT_FOUND':
          showNotification('Student not found. Please check the student ID.', 'error');
          break;
          
        case 'LICENSE_EXPIRED':
          showNotification('Your license has expired. Please contact support.', 'error');
          break;
          
        case 'VALIDATION_ERROR':
          showNotification(`Validation error: ${message}`, 'error');
          break;
          
        case 'RATE_LIMIT_EXCEEDED':
          showNotification('Too many requests. Please wait and try again.', 'warning');
          break;
          
        default:
          showNotification(`Error: ${message}`, 'error');
      }
    });
  }
}

// Usage in components
function MyComponent() {
  const [updateStudent, { loading, error }] = useMutation(UPDATE_STUDENT, {
    onError: handleGraphQLError,
    onCompleted: (data) => {
      showNotification('Student updated successfully!', 'success');
    }
  });

  const { data, loading: queryLoading, error: queryError } = useQuery(GET_STUDENTS, {
    onError: handleGraphQLError,
    errorPolicy: 'all' // Continue rendering with partial data
  });

  // Component render logic...
}
```

This comprehensive examples documentation provides practical, real-world usage patterns for the MyTapTrack GraphQL API, covering all major use cases from basic CRUD operations to real-time subscriptions and error handling.