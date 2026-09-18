cmake_minimum_required(VERSION 3.20)
project(lmpv_ncnn LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(ncnn CONFIG REQUIRED)
find_path(VAPOURSYNTH_INCLUDE_DIR VapourSynth4.h PATH_SUFFIXES vapoursynth REQUIRED)

add_library(lmpv_ncnn SHARED lmpv_ncnn.cpp)
target_include_directories(lmpv_ncnn PRIVATE "${VAPOURSYNTH_INCLUDE_DIR}")
target_link_libraries(lmpv_ncnn PRIVATE ncnn)
set_target_properties(lmpv_ncnn PROPERTIES
  PREFIX "lib"
  OUTPUT_NAME "lmpv_ncnn"
  INSTALL_RPATH "$ORIGIN/../lib"
)

install(TARGETS lmpv_ncnn LIBRARY DESTINATION vapoursynth)
