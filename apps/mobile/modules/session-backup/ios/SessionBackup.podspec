Pod::Spec.new do |s|
  s.name           = 'SessionBackup'
  s.version        = '0.1.0'
  s.summary        = 'Excludes the mongmangE login session MMKV files from iCloud/Finder backup'
  s.description    = 'Local Expo module (C10b): marks Documents/mmkv/mong.session(.crc) with NSURLIsExcludedFromBackupKey at launch. The save store stays in backup.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'mongmangE'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
