#!/bin/bash

# MyTapTrack Development Database and Queue Inspector

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINERS_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$CONTAINERS_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# MongoDB inspection functions
mongodb_stats() {
    print_status "MongoDB Database Statistics:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        print('Database: mytaptrack_dev');
        print('Collections:');
        db.getCollectionNames().forEach(function(collection) {
            var count = db[collection].countDocuments();
            var size = db[collection].stats().size;
            print('  ' + collection + ': ' + count + ' documents (' + (size/1024/1024).toFixed(2) + ' MB)');
        });
        print('');
        print('Database Stats:');
        var stats = db.stats();
        print('  Total Size: ' + (stats.dataSize/1024/1024).toFixed(2) + ' MB');
        print('  Index Size: ' + (stats.indexSize/1024/1024).toFixed(2) + ' MB');
        print('  Collections: ' + stats.collections);
        print('  Indexes: ' + stats.indexes);
    "
}

mongodb_collections() {
    print_status "MongoDB Collections and Sample Data:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        db.getCollectionNames().forEach(function(collection) {
            print('\\n=== Collection: ' + collection + ' ===');
            var count = db[collection].countDocuments();
            print('Total documents: ' + count);
            if (count > 0) {
                print('Sample document:');
                printjson(db[collection].findOne());
            }
        });
    "
}

mongodb_users() {
    print_status "MongoDB Users Data:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        var users = db.primary.find({pk: /^U#/}).limit(10);
        print('Recent Users (limit 10):');
        users.forEach(function(user) {
            print('  ID: ' + user.userId + ', Email: ' + user.data.email + ', Role: ' + user.data.role);
        });
        print('');
        print('User Role Distribution:');
        db.primary.aggregate([
            {\\$match: {pk: /^U#/}},
            {\\$group: {_id: '\\$data.role', count: {\\$sum: 1}}},
            {\\$sort: {count: -1}}
        ]).forEach(function(role) {
            print('  ' + role._id + ': ' + role.count);
        });
    "
}

mongodb_students() {
    print_status "MongoDB Students Data:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        var students = db.primary.find({pk: /^S#/}).limit(10);
        print('Recent Students (limit 10):');
        students.forEach(function(student) {
            print('  ID: ' + student.studentId + ', Name: ' + student.data.firstName + ' ' + student.data.lastName + ', Grade: ' + student.data.grade);
        });
        print('');
        print('Student Grade Distribution:');
        db.primary.aggregate([
            {\\$match: {pk: /^S#/}},
            {\\$group: {_id: '\\$data.grade', count: {\\$sum: 1}}},
            {\\$sort: {_id: 1}}
        ]).forEach(function(grade) {
            print('  Grade ' + grade._id + ': ' + grade.count);
        });
    "
}

mongodb_devices() {
    print_status "MongoDB Devices Data:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        var devices = db.primary.find({pk: /^D#/}).limit(10);
        print('Recent Devices (limit 10):');
        devices.forEach(function(device) {
            print('  ID: ' + device.data.deviceId + ', Model: ' + device.data.model + ', Status: ' + device.data.status + ', Battery: ' + device.data.batteryLevel + '%');
        });
        print('');
        print('Device Status Distribution:');
        db.primary.aggregate([
            {\\$match: {pk: /^D#/}},
            {\\$group: {_id: '\\$data.status', count: {\\$sum: 1}}},
            {\\$sort: {count: -1}}
        ]).forEach(function(status) {
            print('  ' + status._id + ': ' + status.count);
        });
    "
}

mongodb_timeseries() {
    print_status "MongoDB Time-Series Data:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        var studentData = db.data.countDocuments({pk: /^SD#/});
        var deviceData = db.data.countDocuments({pk: /^DT#/});
        print('Time-Series Data:');
        print('  Student Data Points: ' + studentData);
        print('  Device Telemetry Points: ' + deviceData);
        print('  Total Data Points: ' + (studentData + deviceData));
        print('');
        
        if (studentData > 0) {
            print('Recent Student Activity (limit 5):');
            db.data.find({pk: /^SD#/}).sort({timestamp: -1}).limit(5).forEach(function(record) {
                print('  ' + record.data.studentId + ' at ' + record.timestamp + ': Activity=' + record.data.activityLevel + ', Focus=' + record.data.focusScore);
            });
        }
        
        if (deviceData > 0) {
            print('');
            print('Recent Device Telemetry (limit 5):');
            db.data.find({pk: /^DT#/}).sort({timestamp: -1}).limit(5).forEach(function(record) {
                print('  ' + record.data.deviceId + ' at ' + record.timestamp + ': Battery=' + record.data.batteryLevel + '%, Signal=' + record.data.signalStrength + 'dBm');
            });
        }
    "
}

mongodb_shell() {
    print_status "Opening MongoDB shell..."
    docker-compose -f docker-compose.dev.yml exec mongodb mongosh mytaptrack_dev
}

# RabbitMQ inspection functions
rabbitmq_overview() {
    print_status "RabbitMQ Overview:"
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl status | grep -A 20 "Status of node"
    echo ""
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_vhosts
}

rabbitmq_queues() {
    print_status "RabbitMQ Queues:"
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_queues name messages consumers
}

rabbitmq_exchanges() {
    print_status "RabbitMQ Exchanges:"
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_exchanges name type
}

rabbitmq_bindings() {
    print_status "RabbitMQ Bindings:"
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_bindings
}

rabbitmq_connections() {
    print_status "RabbitMQ Connections:"
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_connections name peer_host peer_port state
}

rabbitmq_consumers() {
    print_status "RabbitMQ Consumers:"
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_consumers queue_name channel_details consumer_tag
}

# Redis inspection functions
redis_info() {
    print_status "Redis Information:"
    docker-compose -f docker-compose.dev.yml exec -T redis redis-cli INFO server | grep -E "(redis_version|uptime_in_seconds|connected_clients)"
    echo ""
    docker-compose -f docker-compose.dev.yml exec -T redis redis-cli INFO memory | grep -E "(used_memory_human|used_memory_peak_human)"
    echo ""
    docker-compose -f docker-compose.dev.yml exec -T redis redis-cli INFO keyspace
}

redis_keys() {
    local pattern=${1:-"*"}
    print_status "Redis Keys (pattern: $pattern):"
    docker-compose -f docker-compose.dev.yml exec -T redis redis-cli KEYS "$pattern" | head -20
    echo ""
    local count=$(docker-compose -f docker-compose.dev.yml exec -T redis redis-cli EVAL "return #redis.call('keys', ARGV[1])" 0 "$pattern")
    print_status "Total keys matching '$pattern': $count"
}

redis_sample() {
    print_status "Redis Sample Data:"
    local keys=$(docker-compose -f docker-compose.dev.yml exec -T redis redis-cli KEYS "*" | head -5)
    for key in $keys; do
        if [[ -n "$key" ]]; then
            local type=$(docker-compose -f docker-compose.dev.yml exec -T redis redis-cli TYPE "$key")
            local value=$(docker-compose -f docker-compose.dev.yml exec -T redis redis-cli GET "$key" 2>/dev/null || echo "N/A")
            echo "  $key ($type): $value"
        fi
    done
}

redis_shell() {
    print_status "Opening Redis CLI..."
    docker-compose -f docker-compose.dev.yml exec redis redis-cli
}

# Show usage
show_usage() {
    echo "MyTapTrack Development Database and Queue Inspector"
    echo ""
    echo "Usage: $0 <service> [command] [options]"
    echo ""
    echo "Services:"
    echo "  mongodb     - MongoDB database inspection"
    echo "  rabbitmq    - RabbitMQ message broker inspection"
    echo "  redis       - Redis cache inspection"
    echo ""
    echo "MongoDB Commands:"
    echo "  stats       - Database statistics"
    echo "  collections - List collections with sample data"
    echo "  users       - User data overview"
    echo "  students    - Student data overview"
    echo "  devices     - Device data overview"
    echo "  timeseries  - Time-series data overview"
    echo "  shell       - Open MongoDB shell"
    echo ""
    echo "RabbitMQ Commands:"
    echo "  overview    - General status and vhosts"
    echo "  queues      - List queues with message counts"
    echo "  exchanges   - List exchanges"
    echo "  bindings    - List queue bindings"
    echo "  connections - List active connections"
    echo "  consumers   - List active consumers"
    echo ""
    echo "Redis Commands:"
    echo "  info        - Redis server information"
    echo "  keys [pattern] - List keys (default: all)"
    echo "  sample      - Show sample key-value pairs"
    echo "  shell       - Open Redis CLI"
    echo ""
    echo "Examples:"
    echo "  $0 mongodb stats           # Show MongoDB statistics"
    echo "  $0 mongodb users           # Show user data overview"
    echo "  $0 rabbitmq queues         # Show RabbitMQ queues"
    echo "  $0 redis keys \"user:*\"     # Show Redis keys matching pattern"
    echo "  $0 mongodb shell           # Open MongoDB shell"
}

# Main execution
main() {
    local service=$1
    local command=${2:-"overview"}
    local option=$3
    
    if [[ -z "$service" ]]; then
        show_usage
        exit 1
    fi
    
    case $service in
        mongodb)
            case $command in
                stats)
                    mongodb_stats
                    ;;
                collections)
                    mongodb_collections
                    ;;
                users)
                    mongodb_users
                    ;;
                students)
                    mongodb_students
                    ;;
                devices)
                    mongodb_devices
                    ;;
                timeseries)
                    mongodb_timeseries
                    ;;
                shell)
                    mongodb_shell
                    ;;
                overview|*)
                    mongodb_stats
                    echo ""
                    mongodb_collections
                    ;;
            esac
            ;;
        rabbitmq)
            case $command in
                overview)
                    rabbitmq_overview
                    ;;
                queues)
                    rabbitmq_queues
                    ;;
                exchanges)
                    rabbitmq_exchanges
                    ;;
                bindings)
                    rabbitmq_bindings
                    ;;
                connections)
                    rabbitmq_connections
                    ;;
                consumers)
                    rabbitmq_consumers
                    ;;
                *)
                    rabbitmq_overview
                    echo ""
                    rabbitmq_queues
                    ;;
            esac
            ;;
        redis)
            case $command in
                info)
                    redis_info
                    ;;
                keys)
                    redis_keys "$option"
                    ;;
                sample)
                    redis_sample
                    ;;
                shell)
                    redis_shell
                    ;;
                overview|*)
                    redis_info
                    echo ""
                    redis_sample
                    ;;
            esac
            ;;
        --help|-h|help)
            show_usage
            ;;
        *)
            print_error "Unknown service: $service"
            show_usage
            exit 1
            ;;
    esac
}

main "$@"