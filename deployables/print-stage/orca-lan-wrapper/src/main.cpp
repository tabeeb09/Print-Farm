#include <filesystem>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "slic3r/Utils/NetworkAgent.hpp"
#include "slic3r/Utils/NetworkAgentFactory.hpp"
#include "slic3r/Utils/BBLPrinterAgent.hpp"
#include "slic3r/Utils/bambu_networking.hpp"

using namespace Slic3r;

struct Args {
    std::string job;
    std::string printer_ip;
    std::string printer_serial;
    std::string access_code;
    std::string project_name;
    std::string plate_index = "1";
    bool send_to_sdcard = false;
    bool dry_run = false;
    bool ssl_ftp = false;
    bool ssl_mqtt = false;
};

static std::string get_arg(int argc, char** argv, const std::string& key, const std::string& fallback = "") {
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == key) {
            return argv[i + 1];
        }
    }
    return fallback;
}

static bool has_flag(int argc, char** argv, const std::string& key) {
    for (int i = 1; i < argc; ++i) {
        if (argv[i] == key) {
            return true;
        }
    }
    return false;
}

static Args parse_args(int argc, char** argv) {
    Args args;
    args.job = get_arg(argc, argv, "--job");
    args.printer_ip = get_arg(argc, argv, "--ip");
    args.printer_serial = get_arg(argc, argv, "--serial");
    args.access_code = get_arg(argc, argv, "--access-code");
    args.project_name = get_arg(argc, argv, "--project-name");
    args.plate_index = get_arg(argc, argv, "--plate-index", "1");
    args.send_to_sdcard = has_flag(argc, argv, "--send-to-sdcard");
    args.dry_run = has_flag(argc, argv, "--dry-run");
    args.ssl_ftp = has_flag(argc, argv, "--ssl-ftp");
    args.ssl_mqtt = has_flag(argc, argv, "--ssl-mqtt");
    return args;
}

static void require_nonempty(const std::string& value, const char* label) {
    if (value.empty()) {
        throw std::runtime_error(std::string("Missing required argument: ") + label);
    }
}

static int run_local_print(const Args& args) {
    if (args.dry_run) {
        std::cout << "dry-run ok\n";
        std::cout << "job=" << args.job << "\n";
        std::cout << "printer_ip=" << args.printer_ip << "\n";
        std::cout << "printer_serial=" << args.printer_serial << "\n";
        std::cout << "project_name=" << args.project_name << "\n";
        std::cout << "plate_index=" << args.plate_index << "\n";
        return 0;
    }

    NetworkAgentFactory::register_all_agents();

    const std::string plugin_version = get_latest_network_version();
    if (NetworkAgent::initialize_network_module(false, plugin_version) != 0) {
        std::cerr << "Failed to initialize Orca network module\n";
        return 1;
    }

    const std::string log_dir = std::filesystem::temp_directory_path().string() + "\\orca-bambu";
    BBLNetworkPlugin::instance().create_agent(log_dir);

    auto printer_agent = std::make_shared<BBLPrinterAgent>();
    NetworkAgent agent(nullptr, printer_agent);

    PrintParams params;
    params.dev_ip = args.printer_ip;
    params.dev_id = args.printer_serial;
    params.username = "bblp";
    params.password = args.access_code;
    params.connection_type = "lan";
    params.use_ssl_for_ftp = args.ssl_ftp;
    params.use_ssl_for_mqtt = args.ssl_mqtt;
    params.filename = args.job;
    params.project_name = args.project_name.empty() ? std::filesystem::path(args.job).stem().string() : args.project_name;
    params.plate_index = std::stoi(args.plate_index);
    params.task_bed_leveling = true;
    params.task_flow_cali = false;
    params.task_vibration_cali = false;
    params.task_layer_inspect = false;
    params.task_record_timelapse = false;
    params.task_use_ams = false;

    auto update_fn = [](int stage, int code, std::string info) {
        std::cerr << "[orca] stage=" << stage << " code=" << code << " info=" << info << "\n";
    };

    auto cancel_fn = []() {
        return false;
    };

    if (args.send_to_sdcard) {
        return agent.start_send_gcode_to_sdcard(params, update_fn, cancel_fn, nullptr);
    }
    return agent.start_local_print(params, update_fn, cancel_fn);
}

int main(int argc, char** argv) {
    try {
        Args args = parse_args(argc, argv);
        require_nonempty(args.job, "--job");
        require_nonempty(args.printer_ip, "--ip");
        require_nonempty(args.printer_serial, "--serial");
        require_nonempty(args.access_code, "--access-code");
        return run_local_print(args);
    } catch (const std::exception& e) {
        std::cerr << e.what() << "\n";
        return 1;
    }
}
