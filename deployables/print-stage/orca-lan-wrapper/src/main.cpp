#include <filesystem>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

#include "slic3r/Utils/BBLNetworkPlugin.hpp"
#include "slic3r/Utils/BBLPrinterAgent.hpp"
#include "slic3r/Utils/NetworkAgent.hpp"
#include "slic3r/Utils/NetworkAgentFactory.hpp"
#include "slic3r/Utils/bambu_networking.hpp"

using namespace Slic3r;

namespace {

struct Args
{
    std::string job;
    std::string printer_ip;
    std::string printer_serial;
    std::string access_code;
    std::string project_name;
    std::string plate_index{"1"};
    bool send_to_sdcard{false};
    bool dry_run{false};
    bool ssl_ftp{false};
    bool ssl_mqtt{false};
    bool bed_leveling{true};
    bool flow_cali{false};
    bool vibration_cali{false};
    bool layer_inspect{false};
    bool timelapse{false};
    bool use_ams{false};
};

std::string get_arg(int argc, char** argv, const std::string& key, const std::string& fallback = "")
{
    for (int i = 1; i + 1 < argc; ++i) {
        if (argv[i] == key)
            return argv[i + 1];
    }
    return fallback;
}

bool has_flag(int argc, char** argv, const std::string& key)
{
    for (int i = 1; i < argc; ++i) {
        if (argv[i] == key)
            return true;
    }
    return false;
}

Args parse_args(int argc, char** argv)
{
    Args args;
    args.job            = get_arg(argc, argv, "--job");
    args.printer_ip     = get_arg(argc, argv, "--ip");
    args.printer_serial = get_arg(argc, argv, "--serial");
    args.access_code    = get_arg(argc, argv, "--access-code");
    args.project_name   = get_arg(argc, argv, "--project-name");
    args.plate_index    = get_arg(argc, argv, "--plate-index", "1");
    args.send_to_sdcard = has_flag(argc, argv, "--send-to-sdcard");
    args.dry_run        = has_flag(argc, argv, "--dry-run");
    args.ssl_ftp        = has_flag(argc, argv, "--ssl-ftp");
    args.ssl_mqtt       = has_flag(argc, argv, "--ssl-mqtt");
    args.bed_leveling   = !has_flag(argc, argv, "--no-bed-leveling");
    args.flow_cali      = has_flag(argc, argv, "--flow-cali");
    args.vibration_cali = has_flag(argc, argv, "--vibration-cali");
    args.layer_inspect  = has_flag(argc, argv, "--layer-inspect");
    args.timelapse      = has_flag(argc, argv, "--timelapse");
    args.use_ams        = has_flag(argc, argv, "--use-ams");
    return args;
}

void require_nonempty(const std::string& value, const char* label)
{
    if (value.empty())
        throw std::runtime_error(std::string("Missing required argument: ") + label);
}

void print_usage()
{
    std::cerr
        << "Usage: OrcaSlicer_lan_print --job sliced.gcode.3mf --ip PRINTER_IP "
           "--serial PRINTER_SERIAL --access-code LAN_CODE [options]\n\n"
        << "Options:\n"
        << "  --project-name NAME\n"
        << "  --plate-index N\n"
        << "  --send-to-sdcard\n"
        << "  --ssl-ftp\n"
        << "  --ssl-mqtt\n"
        << "  --no-bed-leveling\n"
        << "  --flow-cali\n"
        << "  --vibration-cali\n"
        << "  --layer-inspect\n"
        << "  --timelapse\n"
        << "  --use-ams\n"
        << "  --dry-run\n";
}

int run_lan_print(const Args& args)
{
    if (args.dry_run) {
        std::cout << "dry-run ok\n"
                  << "job=" << args.job << "\n"
                  << "printer_ip=" << args.printer_ip << "\n"
                  << "printer_serial=" << args.printer_serial << "\n"
                  << "project_name=" << args.project_name << "\n"
                  << "plate_index=" << args.plate_index << "\n";
        return 0;
    }

    NetworkAgentFactory::register_all_agents();

    const std::string plugin_version = get_latest_network_version();
    if (NetworkAgent::initialize_network_module(false, plugin_version) != 0) {
        const auto load_error = NetworkAgent::get_load_error();
        std::cerr << "Failed to initialize Orca/Bambu network module";
        if (load_error.has_error) {
            std::cerr << ": " << load_error.message;
            if (!load_error.technical_details.empty())
                std::cerr << " (" << load_error.technical_details << ")";
            if (!load_error.attempted_path.empty())
                std::cerr << "\nAttempted path: " << load_error.attempted_path;
        }
        std::cerr << "\n";
        return 1;
    }

    const std::string log_dir =
        (std::filesystem::temp_directory_path() / "orca-bambu-lan-print").string();
    if (!BBLNetworkPlugin::instance().create_agent(log_dir)) {
        std::cerr << "Failed to create Orca/Bambu network agent\n";
        return 1;
    }

    auto printer_agent = std::make_shared<BBLPrinterAgent>();
    NetworkAgent agent(nullptr, printer_agent);

    PrintParams params{};
    params.dev_ip                = args.printer_ip;
    params.dev_id                = args.printer_serial;
    params.username              = "bblp";
    params.password              = args.access_code;
    params.connection_type       = "lan";
    params.use_ssl_for_ftp       = args.ssl_ftp;
    params.use_ssl_for_mqtt      = args.ssl_mqtt;
    params.filename              = args.job;
    params.project_name          = args.project_name.empty() ?
                                      std::filesystem::path(args.job).stem().string() :
                                      args.project_name;
    params.plate_index           = std::stoi(args.plate_index);
    params.task_bed_leveling     = args.bed_leveling;
    params.task_flow_cali        = args.flow_cali;
    params.task_vibration_cali   = args.vibration_cali;
    params.task_layer_inspect    = args.layer_inspect;
    params.task_record_timelapse = args.timelapse;
    params.task_use_ams          = args.use_ams;

    auto update_fn = [](int stage, int code, std::string info) {
        std::cerr << "[orca-lan] stage=" << stage << " code=" << code
                  << " info=" << info << "\n";
    };

    auto cancel_fn = []() { return false; };
    auto wait_fn   = []() { return 0; };

    const int result = args.send_to_sdcard ?
        agent.start_send_gcode_to_sdcard(params, update_fn, cancel_fn, wait_fn) :
        agent.start_local_print(params, update_fn, cancel_fn);

    if (result != 0)
        std::cerr << "Orca/Bambu LAN print returned " << result << "\n";

    NetworkAgent::unload_network_module();
    return result == 0 ? 0 : 1;
}

} // namespace

int main(int argc, char** argv)
{
    try {
        if (has_flag(argc, argv, "--help") || argc == 1) {
            print_usage();
            return argc == 1 ? 1 : 0;
        }

        Args args = parse_args(argc, argv);
        require_nonempty(args.job, "--job");
        require_nonempty(args.printer_ip, "--ip");
        require_nonempty(args.printer_serial, "--serial");
        require_nonempty(args.access_code, "--access-code");
        return run_lan_print(args);
    } catch (const std::exception& error) {
        std::cerr << error.what() << "\n";
        return 1;
    }
}
