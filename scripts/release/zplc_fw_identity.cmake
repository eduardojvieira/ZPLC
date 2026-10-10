# Writes zplc_fw_identity.h for a firmware image or the host runtime (REL-023).
#
#   include(<repo>/scripts/release/zplc_fw_identity.cmake)
#   zplc_generate_fw_identity(OUT_DIR <dir> REPO_ROOT <repo> VERSION <semver> [BOARD <name>] [OPTIONS <text>])
#
# The commit comes from git, or from -DZPLC_BUILD_COMMIT=<40 hex> when the tree has no git (a source archive, a
# container without .git); without either it is "unknown", which is reported as it is. -DZPLC_BUILD_DIRTY=0|1 sets the
# flag the same way. The options are the sorted CONFIG_ZPLC_* symbols of the configuration, without that prefix (a Zephyr build), or the
# OPTIONS text of a host build. The result is the variable ZPLC_FW_IDENTITY_DIR in the caller's scope.
#
# ponytail: everything is read at configure time. A commit or a staged change re-runs the configure (the git files
# are configure dependencies); an unstaged edit made after configuring is not seen until the next configure, so a
# release build must configure from a clean checkout.
function(zplc_generate_fw_identity)
  cmake_parse_arguments(ARG "" "OUT_DIR;REPO_ROOT;VERSION;BOARD;OPTIONS" "" ${ARGN})
  foreach(required OUT_DIR REPO_ROOT VERSION)
    if(NOT ARG_${required})
      message(FATAL_ERROR "zplc_generate_fw_identity: ${required} is required")
    endif()
  endforeach()

  # --- commit and dirty flag -------------------------------------------------------------------------------------
  set(commit "")
  set(dirty 0)
  # CMake regular expressions have no {n} repetition: the length is checked apart.
  if(ZPLC_BUILD_COMMIT)
    set(commit "${ZPLC_BUILD_COMMIT}")
    string(LENGTH "${commit}" commit_length)
    if(NOT commit MATCHES "^[0-9a-f]+$" OR NOT commit_length EQUAL 40)
      message(FATAL_ERROR "ZPLC_BUILD_COMMIT must be 40 lowercase hex digits, got '${commit}'")
    endif()
  else()
    find_program(ZPLC_GIT_EXECUTABLE git)
    if(ZPLC_GIT_EXECUTABLE)
      execute_process(
        COMMAND "${ZPLC_GIT_EXECUTABLE}" -C "${ARG_REPO_ROOT}" rev-parse HEAD
        OUTPUT_VARIABLE git_head OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE git_result)
      string(LENGTH "${git_head}" git_head_length)
      if(git_result EQUAL 0 AND git_head MATCHES "^[0-9a-f]+$" AND git_head_length EQUAL 40)
        set(commit "${git_head}")
        execute_process(
          COMMAND "${ZPLC_GIT_EXECUTABLE}" -C "${ARG_REPO_ROOT}" status --porcelain --untracked-files=no
          OUTPUT_VARIABLE git_changes OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET RESULT_VARIABLE status_result)
        if(NOT status_result EQUAL 0 OR NOT git_changes STREQUAL "")
          set(dirty 1)
        endif()
        # A commit or a change of the index re-runs the configure.
        foreach(git_path HEAD index)
          execute_process(
            COMMAND "${ZPLC_GIT_EXECUTABLE}" -C "${ARG_REPO_ROOT}" rev-parse --git-path "${git_path}"
            OUTPUT_VARIABLE git_file OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
          if(git_file)
            if(NOT IS_ABSOLUTE "${git_file}")
              set(git_file "${ARG_REPO_ROOT}/${git_file}")
            endif()
            set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${git_file}")
          endif()
        endforeach()
      endif()
    endif()
  endif()
  if(commit STREQUAL "")
    set(commit "unknown")
  endif()
  if(DEFINED ZPLC_BUILD_DIRTY)
    if(ZPLC_BUILD_DIRTY)
      set(dirty 1)
    else()
      set(dirty 0)
    endif()
  endif()

  # --- options ---------------------------------------------------------------------------------------------------
  set(options "")
  if(ARG_OPTIONS)
    set(options "${ARG_OPTIONS}")
  else()
    get_cmake_property(all_variables VARIABLES)
    list(FILTER all_variables INCLUDE REGEX "^CONFIG_ZPLC_")
    list(SORT all_variables)
    set(pairs "")
    foreach(variable IN LISTS all_variables)
      # the prefix is the same for every symbol, so it is left out of the image (each byte is flash on a small board)
      string(REGEX REPLACE "^CONFIG_ZPLC_" "" symbol "${variable}")
      list(APPEND pairs "${symbol}=${${variable}}")
    endforeach()
    list(JOIN pairs "," options)
  endif()
  if(options STREQUAL "")
    set(options "none")
  endif()
  string(REGEX REPLACE "[^A-Za-z0-9_.,=+:/-]" "_" options "${options}")
  string(SHA256 options_digest "${options}")
  string(SUBSTRING "${options_digest}" 0 8 options_hash)

  set(board "host")
  if(ARG_BOARD)
    set(board "${ARG_BOARD}")
  endif()
  string(REGEX REPLACE "[^A-Za-z0-9_.,=+:/-]" "_" board "${board}")

  set(ZPLC_FW_VERSION "${ARG_VERSION}")
  set(ZPLC_FW_COMMIT "${commit}")
  set(ZPLC_FW_DIRTY "${dirty}")
  set(ZPLC_FW_BOARD "${board}")
  set(ZPLC_FW_OPTIONS "${options}")
  set(ZPLC_FW_OPTIONS_HASH "${options_hash}")
  configure_file("${CMAKE_CURRENT_FUNCTION_LIST_DIR}/zplc_fw_identity.h.in" "${ARG_OUT_DIR}/zplc_fw_identity.h" @ONLY)
  set(ZPLC_FW_IDENTITY_DIR "${ARG_OUT_DIR}" PARENT_SCOPE)
  set(ZPLC_FW_IDENTITY_COMMIT "${commit}" PARENT_SCOPE)
  message(STATUS "ZPLC firmware identity: ${ARG_VERSION} commit ${commit}")
endfunction()
