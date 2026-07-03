cmake_minimum_required(VERSION 3.20)
project(orca_lan_wrapper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# This helper is meant to be built inside an OrcaSlicer source checkout or
# with OrcaSlicer headers/libraries made available to CMake via cache vars.
#
# Required cache variables:
#   ORCA_INCLUDE_DIRS   - OrcaSlicer public include directories
#   ORCA_LIBRARY_DIRS    - directory containing OrcaSlicer link libraries
#   ORCA_LIBRARIES      - semicolon-separated list of Orca libraries to link
#
# Example:
#   cmake -S . -B build ^
#     -DORCA_INCLUDE_DIRS=C:/src/OrcaSlicer/src ^
#     -DORCA_LIBRARY_DIRS=C:/src/OrcaSlicer/build/lib ^
#     -DORCA_LIBRARIES="orca_gui;orca_utils;orca_network"

if(NOT ORCA_INCLUDE_DIRS)
  message(FATAL_ERROR "ORCA_INCLUDE_DIRS is required")
endif()

if(NOT ORCA_LIBRARY_DIRS)
  message(FATAL_ERROR "ORCA_LIBRARY_DIRS is required")
endif()

if(NOT ORCA_LIBRARIES)
  message(FATAL_ERROR "ORCA_LIBRARIES is required")
endif()

add_executable(orca-lan-helper
  src/main.cpp
)

target_include_directories(orca-lan-helper PRIVATE
  ${ORCA_INCLUDE_DIRS}
)

target_link_directories(orca-lan-helper PRIVATE
  ${ORCA_LIBRARY_DIRS}
)

target_link_libraries(orca-lan-helper PRIVATE
  ${ORCA_LIBRARIES}
)

if (WIN32)
  target_compile_definitions(orca-lan-helper PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()
