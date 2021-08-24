import got, { OptionsOfTextResponseBody } from 'got'
import { parse } from 'node-html-parser'
import { URLSearchParams } from 'url'

enum SemesterCodes {
  'winter' = 1, // Opens Early November - given super low priority
  'spring' = 2, // Opens in Late November?
  'summer' = 6, // Opens in Mid March
  'fall' = 9, // Opens May
}

interface ICourseSearch {
  term_in: string
  sel_subj: string[]
  sel_day: string
  sel_schd: string[]
  sel_insm: string[]
  sel_camp: string
  sel_levl: string[]
  sel_sess: string
  sel_instr: string
  sel_ptrm: string[]
  sel_attr: string[]
  sc_sel_attr: string[]
  sel_crse: number
  sel_title?: string
  sel_from_cred?: string
  sel_to_cred?: string
  begin_hh: number
  begin_mi: number
  begin_ap: string
  end_hh: number
  end_mi: number
  end_ap: string
}

const CourseSearchTemplate: ICourseSearch = {
  term_in: '202190', // FIXME:
  sel_subj: [
    'dummy',
    'CS', // TODO:
  ],
  sel_day: 'dummy',
  sel_schd: ['dummy', '%'],
  sel_insm: ['dummy', '%'],
  sel_camp: 'dummy',
  sel_levl: ['dummy', '%'],
  sel_sess: 'dummy',
  sel_instr: 'dummy',
  sel_ptrm: ['dummy', '%'],
  sel_attr: ['dummy', '%'],
  sc_sel_attr: ['dummy', '%'],
  sel_crse: 375, // TODO:
  sel_title: '',
  sel_from_cred: '',
  sel_to_cred: '',
  begin_hh: 0,
  begin_mi: 0,
  begin_ap: 'a',
  end_hh: 0,
  end_mi: 0,
  end_ap: 'a',
}

const fetchByAbbr = async () => {
  const { body } = await got.post(
    `https://ssb.cc.binghamton.edu/banner/bwckschd.p_get_crse_unsec?term_in=202190&sel_subj=dummy&sel_day=dummy&sel_schd=dummy&sel_insm=dummy&sel_camp=dummy&sel_levl=dummy&sel_sess=dummy&sel_instr=dummy&sel_ptrm=dummy&sel_attr=dummy&sc_sel_attr=dummy&sel_subj=CS&sel_crse=375&sel_title=&sel_schd=%25&sel_insm=%25&sel_from_cred=&sel_to_cred=&sel_levl=%25&sel_ptrm=%25&sel_attr=%25&sc_sel_attr=%25&begin_hh=0&begin_mi=0&begin_ap=a&end_hh=0&end_mi=0&end_ap=a`
  )
  console.log(body)
}

const fetchByCRN = async (
  crn: number,
  semester: SemesterCodes = assumeTargetSemester(),
  year: number = new Date().getFullYear()
): Promise<CRNData> => {
  const { body } = await got.get(
    `https://ssb.cc.binghamton.edu/banner/bwckschd.p_disp_detail_sched?term_in=${year}${semester}0&crn_in=${crn}`
  )
  const html = parse(body)
  const errorText = html.querySelector('.errortext')
  if (errorText) {
    throw new TypeError(
      `${errorText.textContent}, make sure the CRN and semester are correct.`
    )
  }

  const courseInformation = html // Will always have at least 4 elements; CRN check protects against edge cases
    .querySelector('th.ddlabel').textContent

  const {
    abbreviation,
    name,
    section,
    subject,
    number,
    crn: courseRegistrationNumber,
  } = extractCourseInformation(courseInformation)

  const capacity = +html.querySelector('td.dddefault:nth-child(2)').textContent // TODO: Courses may have more than one capacity due to cross-listings - see CRN 10010
  const remaining = +html.querySelector('td.dddefault:nth-child(3)').textContent
  console.log(
    `[${abbreviation}] ${name}\n` +
      `Section ${section} : ${courseRegistrationNumber}\n` +
      `${remaining} of ${capacity} seats remaining\n` +
      `https://ssb.cc.binghamton.edu/banner/bwckschd.p_disp_detail_sched?term_in=${year}${semester}0&crn_in=${crn}`
  )

  const semesterSeason =
    SemesterCodes[+semester].charAt(0).toUpperCase() +
    SemesterCodes[+semester].slice(1)

  return {
    crn,
    name,
    abbreviation,
    section,
    capacity,
    remaining,
    subject,
    number,
    isFilled: remaining <= 0,
    semesterCode: `${year}${semester}0`,
    semesterString: `${semesterSeason} ${year}`,
  }
}

interface CourseInfoStringData {
  name: string
  abbreviation: string
  section: string
  subject: string
  number: number
  crn: number
}

interface CRNData extends CourseInfoStringData {
  semesterCode: string
  semesterString: string
  capacity: number
  remaining: number
  isFilled: boolean
}

function extractCourseInformation(
  courseInfoString: string,
  expectedCrn?: number
): CourseInfoStringData {
  const courseInformation = courseInfoString.split(' - ') // Will always have at least 4 elements; CRN check protects against edge cases

  // Uses pop() instead of [a, b, c] syntax due to courses with " - " in their names
  const section = courseInformation.pop() as string
  const abbreviation = courseInformation.pop() as string
  const registrationNumber = courseInformation.pop() as string
  const name = courseInformation.join(' - ')

  // Skip validation if no expectedCrn is provided
  if (expectedCrn) {
    if (!registrationNumber || expectedCrn !== +registrationNumber) {
      throw new Error(
        `A web scraping error occurred, CRNs did not match. | ${expectedCrn} : ${registrationNumber}`
      )
    }
  } else {
    if (isNaN(+registrationNumber)) {
      throw new Error(
        `A web sraping error occurred, CRN was not a number. | ${courseInfoString} : ${registrationNumber}`
      )
    }
  }

  const nameSearchTerms = abbreviation.split(' ')

  if (isNaN(+nameSearchTerms[1])) {
    throw new Error(
      `A web scraping error occurred, course abbreviation did not generate a class number. | ${abbreviation} : [${nameSearchTerms}]`
    )
  }

  if (isNaN(+nameSearchTerms[1])) {
    throw new Error(
      `A web scraping error occurred, course abbreviation did not generate a class number. | ${abbreviation} : [${nameSearchTerms}]`
    )
  }

  const subject = nameSearchTerms[0]
  const number = +nameSearchTerms[1]

  return {
    abbreviation,
    name,
    number,
    section,
    subject,
    crn: +registrationNumber,
  }
}

/**
 * @returns a semester code based on the current date; prioritizes spring and fall
 * TODO: Optimize so spring has more dates, and summer has less.
 */
function assumeTargetSemester(): SemesterCodes {
  const currMonthCode = new Date().getMonth() + 1
  const semesterCodes = Object.values(SemesterCodes).filter(
    (val) => !isNaN(+val)
  ) // Remove strings since TS mirrors the enum
  return (semesterCodes.find((monthCode) => monthCode >= currMonthCode) ||
    semesterCodes[1]) as number
}

;(async () => {
  // const params = new URLSearchParams(
  //   'term_in=202190&sel_subj=dummy&sel_day=dummy&sel_schd=dummy&sel_insm=dummy&sel_camp=dummy&sel_levl=dummy&sel_sess=dummy&sel_instr=dummy&sel_ptrm=dummy&sel_attr=dummy&sc_sel_attr=dummy&sel_subj=CS&sel_crse=375&sel_title=&sel_schd=%25&sel_insm=%25&sel_from_cred=&sel_to_cred=&sel_levl=%25&sel_ptrm=%25&sel_attr=%25&sc_sel_attr=%25&begin_hh=0&begin_mi=0&begin_ap=a&end_hh=0&end_mi=0&end_ap=a'
  // )
  // const result: { [key: string]: string } = {}
  // for (const [key, val] of params) {
  //   result[key] = val
  // }

  // console.log(result)
  
  fetchByAbbr()
  // console.log(await fetchByCRN(32355))
})()
